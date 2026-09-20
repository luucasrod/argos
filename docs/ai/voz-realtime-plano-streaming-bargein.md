# Plano técnico — streaming + barge-in (#237/#238)

> Preparado em 20/09 enquanto #235 (PR #244) e #236 (PR #245) ainda não
> fecharam — **não é permissão pra começar #237/#238 antes deles fecharem**,
> é o desenho pronto pra não perder tempo quando destravar. Base factual:
> `docs/ai/voz-realtime-auditoria.md` (#233) + leitura direta de
> `api/chat.ts`, `api/tts.ts`, `services/voice/textToSpeech.ts` em 20/09.

## Por que travado

`#237` e `#238` dependem de `#235`+`#236` **fechadas** (PR mergeado), não só
abertas. Motivo do protocolo: streaming muda o formato de resposta de
`api/chat.ts`/`api/tts.ts` e a forma como o `CommandRouter` decide fast-path
vs conversational — construir em cima de uma base que ainda pode mudar na
revisão é retrabalho garantido. `rodar-solo` porque cruza zona: decisão de
interrupção nasce no áudio (Claude) mas passa pelo device layer/LLM (Codex).

## 1. Streaming LLM (`api/chat.ts`, zona Codex)

Hoje: `anthropic.messages.create({...})` sem `.stream()`, handler `await`s
inteiro e devolve `res.json()` de uma vez (`api/chat.ts:60-67`).

Mudança: usar `anthropic.messages.stream({...})` e reemitir como
Server-Sent Events (`res.setHeader('Content-Type', 'text/event-stream')`,
`res.write()` por chunk) ou chunked transfer simples — Vercel serverless
functions suportam ambos. Cada evento de texto (`on('text')`) vira um chunk
mandado pro cliente.

**Ponto crítico que já existe hoje e não pode quebrar**: o modelo responde
em JSON estruturado (`ParsedIntent`, `intentParser.ts`), não texto livre —
o parser atual espera o JSON **completo** pra extrair campos
(`device_control`, `expectsResponse`, etc). Streaming token-a-token de um
JSON incompleto não dá pra parsear incrementalmente sem reescrever o parser
pra ser tolerante a JSON parcial (ex.: `partial-json` ou parser incremental
próprio). **Isto é o maior risco de escopo de #237** — ou se resolve com um
parser JSON incremental de verdade, ou o streaming só ajuda a começar a
falar mais cedo pelo campo de *texto a ser falado* (se o schema separar
"fala" de "ação" em campos diferentes, o de fala pode ser lido assim que
fechar, mesmo com o resto do JSON ainda chegando) — **decisão de schema
antes de codar**, não durante.

## 2. Streaming TTS (`api/tts.ts`, zona Codex)

Hoje: ElevenLabs primeiro, `await r.arrayBuffer()` inteiro, devolve
`{audio: base64}` num JSON só (`api/tts.ts` seção TTS, linha ~268 no audit).

Mudança: usar o endpoint de streaming da ElevenLabs
(`/v1/text-to-speech/{id}/stream`) e repassar os chunks pro cliente via
chunked transfer (não dá pra fazer SSE binário direto — é
`audio/mpeg`/`audio/pcm` bruto, não texto — então é `res.write(chunk)` puro
com `Transfer-Encoding: chunked`, sem envelope JSON).

**Segmentação por frase** (quem decide: lado que gera o texto, ou seja o
consumidor de `api/chat.ts`) — bufferizar o texto que vai chegando do LLM
até fechar uma frase (`.`, `!`, `?`, ou pausa natural configurável),
mandar SÓ essa frase pro `api/tts.ts`, tocar assim que o primeiro chunk de
áudio dela chegar, e já mandar a próxima frase pro TTS em paralelo
enquanto a atual toca — é isso que dá a sensação "ele já vai falando
enquanto pensa". Fila de áudio no lado RN (novo: hoje só existe "tocar um
áudio", não "fila de segmentos").

## 3. Playback incremental (`services/voice/textToSpeech.ts`, zona Claude)

Hoje: `speakWithCloud()` recebe base64 completo, decodifica, toca um
arquivo inteiro. Muda pra: um `AudioQueue` simples (array de segmentos +
player que consome o próximo assim que o atual termina), cada segmento
chega como stream HTTP (fetch com `response.body` — RN/Expo suporta reader
de stream via `expo-av`/`expo-audio` streaming de URL, ou salvar em arquivo
temporário incremental se streaming direto não for viável no Android —
**validar no aparelho antes de assumir qual caminho funciona**, não é óbvio
sem testar).

## 4. Sessão contínua multi-turno (parte de #237, zona Claude+Codex)

O mecanismo de 1 turno já existe (`followUpMode.ts`, janela fixa 4000ms).
Generalizar pra N turnos: trocar a flag booleana por um estado de sessão
com timestamp de última atividade + timeout configurável, sem exigir wake
word de novo enquanto a sessão estiver "quente". Reaproveitar
`armVoskUtterance()` — não precisa de mecanismo novo de captura, só de
controle de quando ele é chamado automaticamente.

## 5. Barge-in (#238, zona Claude, o mais arriscado)

**Vosk já está sempre ouvindo** — tecnicamente já dá pra detectar fala nova
durante a resposta do Argos. O que falta:

1. **Distinguir usuário de eco do próprio TTS.** Não há AEC (echo
   cancellation) no pipeline hoje — nenhuma lib, nenhuma configuração do
   `AudioRecord`. `MediaRecorder.AudioSource.VOICE_COMMUNICATION` (em vez de
   `VOICE_RECOGNITION`, usado hoje) ativa AEC de hardware/software do
   Android quando disponível — **candidato a testar primeiro**, troca de
   uma constante, mas pode piorar a qualidade do reconhecimento porque o
   preprocessing de `VOICE_COMMUNICATION` é otimizado pra voz humana
   próxima ao mic, não pra comando à distância. Precisa comparar as duas
   fontes no aparelho antes de trocar de vez.
2. **Fallback sem AEC de verdade**: se `VOICE_COMMUNICATION` não resolver
   bem, mitigação mais simples e honesta — abaixar o volume do TTS (não
   mutar o mic) enquanto toca, e exigir uma janela mínima de fala
   contínua (ex.: 400-600ms acima de um limiar de energia) antes de
   considerar "isto é o usuário, não eco" — reduz falso-positivo ao custo
   de adicionar uns 400ms de latência de interrupção. Documentar como
   limitação conhecida se for o caminho escolhido, não vender como AEC
   real.
3. **Interrupção**: `stopAllSpeech()` já existe (`textToSpeech.ts:154-157`)
   como botão mudo manual — o trabalho de #238 é chamar essa mesma função a
   partir da detecção de fala nova, mais **cancelar os segmentos de
   TTS/fila que ainda não tocaram** (novidade do item 2/3 acima — sem fila,
   não tem o que cancelar; com streaming isso já existe naturalmente).
4. **Métrica nova**: `barge_in_stop_ms` (#241) — tempo entre início da fala
   detectada e a reprodução parar de verdade. Só existe depois disto
   implementado.

## 6. Ordem de execução sugerida quando destravar

1. Schema do LLM: separar campo "fala" de campo "ação" no JSON de resposta
   (decisão de contrato, `services/ai/systemPrompt.ts` + `intentParser.ts`,
   zona Codex) — desbloqueia streaming de fala sem esperar parser JSON
   incremental completo.
2. `api/tts.ts` streaming (Codex) + `AudioQueue` no RN (Claude) — podem
   andar em paralelo, contrato é só "URL/endpoint que devolve chunks de
   áudio".
3. `api/chat.ts` streaming consumindo o schema novo do item 1 (Codex).
4. Segmentação por frase ligando 1+2+3 (Claude, no hook que hoje chama
   `createMessage`/`speakWithCloud`).
5. Barge-in (Claude) — só depois de 1-4 existirem, porque cancelar fila de
   áudio só faz sentido quando existe fila.
6. Sessão multi-turno (Claude) — pode andar em paralelo com 5, não depende
   dele.
7. Telemetria #241 nomeando os marcos que só passam a existir depois disto
   tudo (Codex, `services/voice/perfLog.ts` + agregação em algum backend).

## Custo (documento fonte pede medir desde já)

Streaming não muda o volume total de tokens/minutos de TTS consumidos —
muda só a latência percebida. Telemetria de custo por turno (tokens Claude,
segundos de áudio ElevenLabs) deveria nascer junto com o item 3, não
esperar a fase 8 (#241), porque sem isso não dá pra saber se streaming
completo (#237+#238) é economicamente sustentável em produção antes de já
estar tudo construído.
