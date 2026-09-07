# Auditoria do pipeline de voz atual — issue #233

Levantamento factual do estado REAL do código na branch `experimento-grande`,
feito por inspeção direta (Read/Grep) em 07/09/2026. Objetivo: dar às issues
#234–#242 (fases do épico #232, voz conversacional em tempo real) uma base
real em vez de suposição sobre nomes de arquivo, frameworks ou serviços.
`docs/ai/CONTEXT.md` já documenta boa parte disto — este arquivo verifica,
detalha com `file:line` e sinaliza onde o código já andou e o CONTEXT ainda
não foi atualizado.

---

## 1. Wake word

**Engine:** Vosk (`org.vosk:vosk-android`), modelo `assets/model-pt` (~45MB),
carregado por um módulo nativo próprio `ArgosVoice`
(`plugins/native/ArgosVoiceModule.kt`), **não** pelo `SpeechService` da lib
`react-native-vosk` — essa lib continua no projeto só pelo plugin de
empacotamento do modelo (asset versioning); nenhuma função JS dela é chamada.

**Dono do áudio:** um único `AudioRecord`
(`ArgosVoiceModule.kt:134-150`, `MediaRecorder.AudioSource.VOICE_RECOGNITION`,
16kHz mono PCM16) aberto uma vez em `start()` e **nunca fechado** enquanto a
escuta estiver ativa. Uma thread só (`recordLoop`, `ArgosVoiceModule.kt:160-186`,
nome `ArgosVoiceLoop`) lê em loop `while (running)` e SEMPRE chama
`recognizer.acceptWaveForm()` (`ArgosVoiceModule.kt:179`) — o que muda por
frame é só se o frame *também* vai para o buffer PCM (`capturing`).

**Gramática:** ~205 entradas (`voskWakeWord.native.ts:295-334`, `buildGrammar`),
montada em runtime a partir de: wake word + variantes de prefixo/sufixo, todas
as `COMMAND_PHRASES` (`voskWakeWord.native.ts:67-120`), nomes reais de
dispositivo/cômodo (`extraPhrases`) e a lista `DECOYS` (`voskWakeWord.native.ts:55-64`,
palavras-isca para a fala comum ter onde cair). Passada ao nativo como
`ReadableArray` → `JSONArray` real (`ArgosVoiceModule.kt:101-107` `grammarToJson`,
corrigido no PR #224 depois de concatenação de string manual quebrar com aspas
no nome de um aparelho).

**Ciclo de vida:**
- `startVoskWakeWord()` (`voskWakeWord.native.ts:651-689`) — carrega modelo
  (`ensureModel`), monta padrões/gramática, assina `onPartialResult`/`onResult`/`onError`,
  chama `startRecognizer()` com até 6 tentativas (backoff 250ms×tentativa,
  `voskWakeWord.native.ts:631-649`) porque o `AudioRecord` antigo pode ainda
  não ter sido liberado.
- `suspendVoskWakeWord()` / `resumeVoskWakeWord()` (`voskWakeWord.native.ts:715-728`)
  — chamam `Vosk.stop()`/`start()` de novo, ou seja, aqui SIM o `AudioRecord`
  é fechado e reaberto (diferente do meio de uma sessão de escuta contínua).
- `stopVoskWakeWord()` (`voskWakeWord.native.ts:730-741`) — encerra de vez,
  limpa listeners.
- No nativo, `cleanup()` (`ArgosVoiceModule.kt:273-295`) tem ordem
  deliberada — `audioRecord.stop()` primeiro para destravar um `read()`
  pendente, só depois `thread.join(1000)`, só depois libera
  `audioRecord`/`recognizer` — corrigida na revisão cruzada do PR #224 por
  causa de um crash JNI (chamar método nativo em `Recognizer` já fechado).

**Pré-roll / buffer circular:** **não existe.** O buffer PCM
(`commandBuffer`, `ArgosVoiceModule.kt:61,167-174`) só começa a acumular
quando `armCommandCapture()` é chamado (`ArgosVoiceModule.kt:189-193`), e
isso só acontece DEPOIS que a wake word já foi confirmada no lado JS
(`voskWakeWord.native.ts:552`, dentro de `handle()`, ramo `!armed`). Antes
disso o loop nativo só alimenta o recognizer — nenhum frame de áudio é
retido. Ou seja: o trecho de fala que precede/contém a própria wake word
nunca é capturado como PCM bruto; só o que vem depois. Isto é uma lacuna
real e direta para o que a Fase 2 (#235, audio core) provavelmente vai
querer (buffer circular pré-wake-word, para não perder o começo do comando
quando ele vem colado — "ei argos desliga a luz" dito rápido).

---

## 2. STT

**Fluxo gramatical (Vosk), ponta a ponta** (`services/voice/voskWakeWord.native.ts`):
- `handle(raw, isFinal)` (linhas 527-598) processa parcial e final. No ramo
  não-armado, detecta a wake word via duas regex (`buildWakePatterns`,
  linhas 227-241): padrão B (`nome + sufixo`, ex. "argos escuta") testado
  antes do A (`prefixo + nome`, ex. "ei argos") por ser mais específico.
  No ramo armado, tudo que chega é comando; se a wake word reaparecer numa
  revisão do Vosk entre parcial e final, um padrão de resíduo separado
  (`buildResiduePattern`/`findResidueEnd`, linhas 268-283) descarta o que
  sobrou dela.
- **Corte por silêncio**: `COMMAND_SILENCE_MS = 1000` (linha 130, já baixou
  de 1200→800→1000ms ao longo das issues #14/#204), com uma janela maior
  (`CONNECTOR_SILENCE_MS = 1500`, linha 152) quando a última palavra
  reconhecida é uma preposição/conector pendente (`TRAILING_CONNECTOR_WORDS`,
  linha 150) — heurística do #204 para não cortar "luz do escritório [pausa]
  em azul" no meio.
- Timer de silêncio só reinicia quando a transcrição realmente avança
  (`now !== lastCommand`, linhas 589-597) — o Vosk repete a mesma parcial
  durante o silêncio, e reiniciar a cada evento impediria o corte.
- `utteranceGeneration` (linhas 397-411) protege contra corrida: um
  cancelamento + nova fala armada antes do Whisper resolver não deve
  entregar o texto da fala antiga (achado na revisão cruzada do PR #224).

**Heurística A-065 / #230 (dangling connector):** `submitLocked()`
(linhas 444-505) decide se vale tentar o Whisper com base em duas
condições, ambas já existentes antes de #230 exceto a segunda:
1. `shortForDuration` (linha 455) — falou ≥2500ms
   (`SUSPICIOUS_MIN_SPEECH_MS`) e o texto final ficou com ≤6 caracteres
   (`SUSPICIOUS_MAX_CHARS`) — sinal de que a gramática descartou a fala.
2. `truncated` (linha 460, `endsWithDanglingWord`, linhas 391-395) — texto
   não vazio mas termina numa palavra de `TRAILING_CONNECTOR_WORDS` mesmo
   depois da janela de silêncio maior já ter dado mais tempo — ex.: "clima
   em" (cortado de "clima em Santo André"), que não bate no critério 1
   (mais de 6 caracteres) mas ainda é corte real. Este é o merge #230
   mencionado no contexto da tarefa.

Quando `suspicious` é true, chama `Vosk.getCommandAudioBase64()`
(→ `ArgosVoiceModule.kt:215-224`, `capturing=false`, WAV RIFF 44 bytes na
frente do PCM) e manda para `transcribeCommandAudio()`
(`services/voice/commandAudioTranscribe.native.ts:15-42`) — `POST /api/transcribe`,
`Authorization: Bearer <token>`, `AbortController` com timeout de 10s
(linha 12). Em qualquer falha (rede, sessão, endpoint fora do ar, timeout),
o `catch` (`voskWakeWord.native.ts:486-491`) é silencioso de propósito —
mantém o texto (possivelmente vazio) que a gramática já tinha, nunca trava
esperando a nuvem.

**`api/transcribe.ts`** (`api/transcribe.ts`): endpoint único usado tanto
pelo fallback nativo quanto pelo fluxo de toque-no-orb web
(`customCapture.web.ts`). Aceita JSON `{audio: base64, mimeType}` ou
`multipart/form-data`. `bodyParser` desligado (linha 19) para ler o corpo
cru. Chama OpenAI Whisper (`whisper-1`, `language: 'pt'`, linhas 197-207).
Sem `OPENAI_API_KEY`, devolve 503 (linhas 142-147) — silencioso do lado do
cliente, mesmo padrão do TTS. Áudio com menos de 800 bytes é descartado sem
chamar a API (linha 192-195, evita gastar request em silêncio puro).

---

## 3. LLM

**Onde é chamado:** `api/chat.ts` (endpoint Vercel) — `hooks/useArgos.ts`
chama `createMessage()` de `services/ai/anthropicProxy.native.ts` (linha 9,
`hooks/useArgos.ts:9`), que faz `POST /api/chat` com `Authorization: Bearer`.
`api/chat.ts:60-67` chama `anthropic.messages.create({ model, system,
messages, max_tokens })` — **sem streaming** (não usa
`.stream()`/`messages.stream`, não há SSE nem chunked response; o handler
`await`s a chamada inteira e devolve `res.status(200).json(response)`
de uma vez, linha 67). O client mobile também `await`s a resposta inteira
(`anthropicProxy.native.ts:57-72`, `response.json()`).

**Tool/function calling:** **não existe tool-calling nativo da API
Anthropic** — `api/chat.ts` não passa parâmetro `tools` nem `tool_choice`
para `anthropic.messages.create`. Em vez disso é um contrato de prompt: o
`system` prompt (`services/ai/systemPrompt.ts:125` em diante) instrui o
modelo a "SEMPRE responda em JSON estruturado" com um schema específico por
tipo de intent (`device_control`, `automation`, `get_weather`, `set_reminder`,
`save_note`, `play_music`, etc. — `services/ai/intentParser.ts:1-51`,
interface `ParsedIntent`). O parser (`intentParser.ts:53-74`,
`parseAIResponse`) extrai o JSON com uma regex gulosa (`/\{[\s\S]*\}/`) do
texto bruto da resposta e faz `JSON.parse` — **não** há streaming
incremental de tool calls nem múltiplos blocos de `tool_use`; é um único
blob JSON por resposta, entregue só quando a resposta inteira chegou.
Resultado: as "ações" (controle de dispositivo, lembrete, nota, música,
clima) são **estruturadas** (campos tipados em `ParsedIntent`), mas o
mecanismo que produz esse JSON é convenção de prompt + parse manual, não a
API de tools da Anthropic — então não há validação de schema do lado do
SDK, nem possibilidade de streaming de tool call parcial.

**Ações reais (calendário, memória, dispositivos):** despacham a partir do
`type` do `ParsedIntent` em `hooks/useArgos.ts` — cada tipo tem seu próprio
bloco de execução no hook (fora do escopo desta leitura linha-a-linha, mas
confirmado pela shape do parser). Extração de memória (`newMemory`) e
`expectsResponse` são campos adicionais que o próprio JSON já carrega,
processados por `services/ai/memorySuggestions.ts` /
`services/voice/followUpMode.ts` respectivamente.

---

## 4. TTS

**`api/tts.ts`:**
- Prioridade: **ElevenLabs primeiro** (`ELEVEN_MODEL = 'eleven_flash_v2_5'`,
  linha 50), Azure Speech como segunda opção, voz do sistema (client-side)
  como último recurso silencioso.
- Seleção de voz: mapa fixo de `voice` curto → `voiceId` do ElevenLabs
  (`ELEVEN_VOICES`, linhas 30-44: sarah/laura/alice/matilda/brian/george/nassif).
  Se o cliente não especificar `voice`, escolhe por `gender` vindo de
  `personality.voiceGender` (linhas 236-240) — `george` (masculina padrão,
  funciona no plano grátis) ou `sarah` (feminina padrão). `nassif`
  (sotaque BR nativo) só funciona em plano pago (documentado, dá 402 no
  grátis, linhas 37-43).
- **Não é streaming** — a rota faz `fetch()` para a API do ElevenLabs,
  espera o `ArrayBuffer` inteiro (`await r.arrayBuffer()`, linha 268),
  converte para base64 e devolve num único JSON `{audio, mime, provider}`
  (linhas 269-271). Não usa o endpoint de streaming da ElevenLabs
  (`/v1/text-to-speech/{id}/stream`) nem SSE/chunked transfer.
- `speed` do ElevenLabs limitado a 0.7–1.2 (linha 261, clamped) — fora
  disso a API real (não usada aqui) devolveria 422.
- Fallback: erro do ElevenLabs sem `AZURE_KEY` configurada → 502 direto
  (linhas 276-283); com Azure configurada, cai para SSML Azure (linhas
  286-330) — também full-buffer (`await azureRes.arrayBuffer()`, linha 321).
- Sem nenhum provider configurado: 503 imediato (linha 207), reconhecido
  pelo cliente para cair na voz do sistema.

**Lado RN (playback):** `services/voice/textToSpeech.ts:28-134`.
- Chama `speakWithCloud()` (`services/voice/cloudTts.ts`, importado
  dinamicamente) primeiro; se `falou` for `false` ou lançar exceção, cai
  para `expo-speech` (voz do sistema) — sem nunca ficar mudo.
- **Reprodução não é incremental**: o áudio só chega como base64 de uma
  resposta JSON única (consequência direta do full-buffer do `api/tts.ts`),
  então não existe "começar a tocar assim que os primeiros bytes chegam" —
  a reprodução só pode começar depois do JSON inteiro ter sido recebido e
  decodificado.
- Guard de segurança (linhas 82-113): como `expo-speech` no Android não
  garante `onDone`/`onError`, um timer estimado por comprimento do texto
  (~10 char/s) reagenda checagens via `Speech.isSpeakingAsync()` em vez de
  interromper a fala — importante porque cortar cedo demais truncaria a
  frase.

---

## 5. Fast path (`matchFastDeviceCommand`)

`services/ai/fastIntent.ts:170-248`. Cobre, na ordem:
1. `matchHouseCommand` (linhas 79-110) — "boa noite" (desliga luzes e TVs
   acessíveis) e "desliga as luzes [do cômodo]", mas só se a frase NÃO for
   composta (`isCompound`, regex `\b(e|depois|tambem)\b`, linha 92) —
   frases compostas caem para a IA.
2. `matchBrightnessCommand` (linhas 116-165) — variações de brilho
   (percentual explícito, máximo/mínimo/alto/baixo por palavra-chave),
   filtrando por nome de aparelho quando mencionado.
3. Liga/desliga/alterna simples (linhas 188-231) — casa por nome completo
   do aparelho ou, se nenhum casar, por token parcial significativo
   (`nameTokens`, linhas 41-45) **só quando exatamente um** aparelho casa
   (linhas 211-216) — ambíguo (duas luzes) vai para a IA, que tem contexto
   para desempatar.

**Bail-out explícito para a IA:**
- Frases com mais de 10 palavras (linha 176) — "tendem a ter
  contexto/condições".
- Qualquer `COLOR_WORDS` presente (linha 179) — este é exatamente o bug
  documentado em `docs/ai/CONTEXT.md` ("Atalho rápido engolindo a frase"):
  antes, o atalho reconhecia só o verbo e ignorava o resto da frase em
  silêncio ("liga a luz **e deixa vermelho**" virava só "liga a luz"); a
  correção foi rejeitar a frase inteira cedo quando ela contém vocabulário
  que o atalho não processa, deixando a IA cuidar de tudo.
- Casamento de nome ambíguo (0 ou 2+ aparelhos por token parcial) — `null`.
- Qualquer combinação que não bata nenhum dos três matchers — `null`.

**Idempotência / duplicação:** o atalho é chamado em `hooks/useArgos.ts:703`
ANTES de qualquer chamada à IA (`const fastIntent = matchFastDeviceCommand(...)`)
— quando `fastIntent` não é `null`, o fluxo (`hooks/useArgos.ts:704+`)
executa a ação e retorna cedo (`perfMark('fast_intent (sem chamar a IA)')`),
**sem** chamar `createMessage`/a IA para essa mesma entrada. Não há
possibilidade de duplicação HOJE porque a chamada é mutuamente exclusiva
(if/else no fluxo síncrono) — mas isso também significa que não existe
nenhum mecanismo de deduplicação por `commandId`/idempotência a nível de
protocolo (o `contracts/protocol.ts` já define `commandId` como chave de
idempotência, mas nada no fast path o usa — ver seção 10). Isso importa
para a Fase 3 (#236): se o fast path e o LLM streaming rodarem em paralelo
(corrida real, não mais exclusão síncrona), a ausência de idempotência por
`commandId` é uma lacuna real, não teórica.

Existe um contrato de teste (não integrado a nenhum test runner formal —
ver seção 9) em `services/ai/fastIntentContract.ts` que cobre: todas as
luzes acessíveis, filtro por cômodo sem luz acessível (`null`), "boa noite"
(múltiplas ações), e fallback de comando composto desconhecido (`null`).

---

## 6. Local vs. cloud device routing (padrão Tuya)

Duas peças distintas, fáceis de confundir pelo nome:

1. **`tuyaControlWithFallback`** (`api/_lib/handlers/tuya.ts:33-48`) —
   **não é** local-vs-cloud. É um fallback de CÓDIGO dentro da nuvem Tuya:
   tenta `switch_led` e, se a API da nuvem rejeitar, tenta de novo com
   `switch` (dois DPs diferentes que modelos distintos de lâmpada usam para
   ligar/desligar). Bug documentado no CONTEXT.md ("Tuya com dois
   códigos").
2. **`controlTuyaLocalFirst`** (`stores/useDeviceStore.ts:145-180`) — **este
   sim é o padrão local-primeiro-depois-nuvem** que a spec quer generalizar.
   Decide `canUseLan` (linha 155-156) checando: não é web, tem
   `tuyaLocalKey` e `tuyaIp` salvos, protocolo é `3.1` ou `3.3` (`3.4`/`3.5`
   usam GCM e não são suportados — `services/devices/tuyaLocal.native.ts:39-43`),
   e o comando é traduzível para DPs locais (`buildTuyaLocalDps`). Se tudo
   isso bate, tenta `tuyaLocalSet()` (protocolo binário Tuya sobre TCP porta
   6668, AES-128-ECB, timeout de 700ms — `tuyaLocal.native.ts:1-260`); em
   QUALQUER falha ou timeout, cai silenciosamente
   (`catch { /* cai na nuvem */ }`, linha 172-174) para
   `controlTuyaDevice()` via nuvem (linha 178).
   - **Achado que diverge do CONTEXT.md**: a tabela de pendências do
     CONTEXT.md diz "Controle local Tuya | Código pronto, **não ligado ao
     store**" — isso está desatualizado. `controlTuyaLocalFirst` está
     ligado e é chamado pelo store (confirmado por leitura direta,
     `stores/useDeviceStore.ts:145` em diante). Vale corrigir o CONTEXT.md
     numa sessão futura.
   - `tuyaLocalReachable()` (`tuyaLocal.native.ts:281-286`) existe como
     helper de probe (consulta status), mas não é chamado antes do
     controle — o código tenta LAN direto e só cai para nuvem no timeout
     (700ms), não faz uma checagem de alcançabilidade prévia separada.
   - Há um padrão irmão para WiZ (`buildWizLocalParams`/`loadWizLocalDirect`,
     `stores/useDeviceStore.ts:182+`), mesmo formato local-primeiro.
   - **Generaliza para outros providers?** Estruturalmente sim (mesmo
     padrão "monta payload local → tenta com timeout curto → catch silencioso
     → chama a função de nuvem equivalente" já repetido para Tuya e WiZ),
     mas HOJE é código duplicado por provider dentro de `useDeviceStore.ts`,
     não uma abstração compartilhada (`contracts/protocol.ts` define
     `CommandRoute = 'local' | 'cloud'` mas nada usa esse tipo aqui —
     ver seção 10). Isso é exatamente o tipo de generalização que a Fase 6
     (#239) provavelmente vai formalizar.

---

## 7. Sessão / follow-up (#147, A-052)

**Não existe** uma "sessão de conversa" persistente com múltiplos turnos
livres. O que existe é um mecanismo de UM turno de follow-up:

- `services/ai/systemPrompt.ts` instrui o modelo a incluir
  `expectsResponse: true` no JSON quando a resposta termina numa pergunta
  direta ao usuário (`systemPrompt.ts:277`).
- `hooks/useArgos.ts` chama `markAwaitingFollowUp()`
  (`services/voice/followUpMode.ts:14-16`) quando processa um intent com
  esse campo — seta uma flag módulo-level simples (`awaitingFollowUp`,
  linha 11), não uma store nem contexto React.
- `hooks/useVoice.ts:344-357` — quando a fala do Argos termina
  (`wakeWordEngine.resume()`), chama `consumeAwaitingFollowUp()`
  (lê-e-reseta atômico, `followUpMode.ts:23-27`); se `true`, chama
  `wakeWordEngine.armUtterance()` — que é o MESMO mecanismo do toque no
  orb: `armVoskUtterance()` (`voskWakeWord.native.ts:696-704`), que arma
  captura direto (sem exigir "ei argos" de novo) por uma janela fixa de
  `AWAIT_COMMAND_MS = 4000ms` (`voskWakeWord.native.ts:132`). Se a pessoa
  não responder nesse tempo, o silêncio expira e o motor volta sozinho ao
  modo passivo (`armed=false`) — não fica escutando indefinidamente.

**Diferenças em relação ao `FOLLOW_UP_WINDOW` da spec nova:**
- É de UM turno só: cobre "Argos pergunta → usuário responde", não uma
  cadeia livre de vários turnos sem repetir wake word.
- A janela é fixa (4000ms, a mesma constante do toque manual no orb) — não
  há janela configurável nem lógica de expiração de "sessão" separada.
- Não há estado de "sessão ativa" que sobrevida a múltiplas trocas — é uma
  flag booleana que é consumida uma vez.
- Nenhuma noção de contexto conversacional contínuo entre o follow-up e o
  próximo comando fora dessa janela — cada novo comando arrancado pela wake
  word é, para efeitos de reconhecimento, independente (o histórico de
  chat que vai para a IA é outra camada, `buildApiMessageHistory`, não
  relacionada a este mecanismo de escuta).

---

## 8. Telemetria existente

`services/voice/perfLog.ts` — instrumentação simples por "turno" com tag
`[argos-perf]` no logcat (`ReactNativeJS`):
- `perfStart(reason)` (linhas 26-31) — abre um turno, zera as marcas.
- `perfMark(label)` (linhas 34-40) — registra um marco com delta desde a
  marca anterior E total desde o início do turno; loga a cada chamada.
- `perfEnd(label)` (linhas 43-54) — fecha o turno e loga um resumo
  "TOTAL Xms — etapa1=Yms | etapa2=Zms | ...".
- `perfAbort()` (linhas 57-59) — cancela sem logar (ex.: usuário digitou em
  vez de falar).

Chamado em pelo menos: `voskWakeWord.native.ts:450` (`perfStart('fim_da_fala
(silencio detectado)')`), `hooks/useArgos.ts:705` (`perfMark('fast_intent
(sem chamar a IA)')`), `textToSpeech.ts:48/50` (`tts_cloud_falhou_caindo_para_sistema`),
`textToSpeech.ts:89` (`perfEnd('tts_sistema_terminado')`). Mede, portanto,
uma fatia do pipeline: fim-da-fala → decisão de fast-path/IA → TTS →
áudio-do-sistema-terminado. **Não mede** o tempo de rede até
`api/chat`/`api/tts` isoladamente (fica embutido dentro de blocos maiores
do hook), nem tempo de STT em si (Vosk é on-device e não tem marco
próprio hoje).

**Comparado às 14 métricas exigidas pela issue #241** (lista literal
obtida via `gh issue view 241`): `wake_to_listening_ms`,
`end_of_user_turn_to_route_ms`, `fast_path_execution_ms`,
`end_of_user_turn_to_first_audio_ms`, `llm_first_token_ms`,
`tts_first_audio_ms`, `barge_in_stop_ms`, `local_command_total_ms`,
`cloud_command_total_ms`, `voice_session_duration_s`,
`user_speech_duration_s`, `argos_speech_duration_s`, `fast_path_count` vs
`conversational_path_count`, contagem de fallback/erro por provider —
**nenhuma dessas métricas existe hoje como marco nomeado**. O mais próximo
é o par `perfStart('fim_da_fala...')` → `perfEnd('tts_sistema_terminado')`,
que dá um TOTAL aproximado equivalente a
`end_of_user_turn_to_first_audio_ms` mas sem quebrar em sub-etapas
nomeadas como a spec pede (`llm_first_token_ms` e `tts_first_audio_ms` em
particular são impossíveis de medir hoje porque nem o LLM nem o TTS são
streaming — não existe "primeiro token"/"primeiro áudio", só "resposta
inteira chegou"). `barge_in_stop_ms` não existe porque barge-in não existe
(não há mecanismo de interromper o Argos falando). `fast_path_count`/
`conversational_path_count` teriam que ser inferidos a partir do log de
texto atual (`fast_intent (sem chamar a IA)` vs. o resto) — não são
contadores agregados hoje, só linhas de log por turno individual.
`voice_session_duration_s` não existe porque não há conceito de sessão
(seção 7). Também **não há mecanismo de opt-in/consentimento** para
retenção de áudio — a issue #241 exige isso explicitamente para qualquer
coleta de áudio de diagnóstico, e hoje o áudio capturado
(`armCommandCapture`) é só transiente em memória (nunca persistido,
sempre resetado após uso ou cancelamento) e não há telemetria de custo
(tokens Claude, minutos de TTS/STT) agregada em lugar nenhum.

---

## 9. Testes existentes

**Não há test runner configurado.** `package.json` (`scripts`, linhas
5-14) só tem `start`, `dev`, `web`, `android`, `ios`, `build:web`,
`serve:web`, `deploy` — nenhum `test`. Confirma o que
`docs/ai/CONTEXT.md` já diz ("Não há lint nem testes configurados").

O que existe é um padrão de "contrato" próprio, arquivos `*.selftest.mjs`
e `*Contract.ts` que fazem `assert()` manual e retornam a lista de nomes
de caso testado, sem framework (Jest/Vitest inexistentes no projeto):
- `contracts/protocol.selftest.mjs`, `contracts/actionPermissions.selftest.mjs`,
  `contracts/context.selftest.mjs` — testam os contratos canônicos
  (`contracts/protocol.ts`, `contracts/actionPermissions.v1.ts`,
  `contracts/context.v1.ts`).
- `services/ai/fastIntentContract.ts` (mostrado acima),
  `services/ai/personalMemoryServiceContract.ts`,
  `services/ai/preferenceServiceContract.ts`,
  `services/ai/feedbackProcessorContract.ts` — mesmo padrão para outras
  camadas.

Nenhum desses `.selftest.mjs`/`*Contract.ts` aparece referenciado em
`package.json` nem em qualquer workflow de CI encontrado no repo
(`grep` por "selftest" em `*.js/*.mjs/*.json/*.yml/*.yaml` não encontrou
nenhum arquivo que os invoque) — ou seja, hoje são executáveis manualmente
(`node contracts/protocol.selftest.mjs`, supostamente) mas não há
evidência de que rodem automaticamente em algum gate. Nada de voz
propriamente dito (Vosk, TTS, fast path E2E) tem cobertura automatizada
além do contrato leve de `fastIntentContract.ts`, que testa só a lógica
pura de `matchFastDeviceCommand` com devices mockados — nenhum teste toca
o módulo nativo, o Whisper, o ElevenLabs/Azure, ou o fluxo completo.

---

## 10. Argos Home / Argos Cloud

**Confirmado: não existem hoje.** `docs/ai/CONTEXT.md` já afirma isso
("Home Assistant é uma integração unidirecional HA → Argos... O app não
lê nem controla entidades cadastradas somente no Home Assistant" — isto é
sobre Home Assistant de terceiros, não "Argos Home"/"Argos Cloud" como
produtos próprios do épico #232). Nenhuma busca por "Argos Home"/"Argos
Cloud" como conceito de produto encontrou implementação.

**O que já antecipa esse contrato:** `contracts/protocol.ts` — arquivo
inteiro (311 linhas) dedicado a um protocolo de wire agnóstico de vendor,
versionado (`PROTOCOL_VERSION = 1`, linha 2). Define:
- `CommandOrigin` com `kind: 'app' | 'home' | 'cloud' | 'automation' |
  'integration'` (linha 8) — já reserva `'home'` e `'cloud'` como origens
  possíveis de comando, exatamente os dois produtos que ainda não existem.
- `CommandTarget` (device/room/home, linhas 21-24), `CommandRequest`/
  `CommandAck`/`CommandResult` com `commandId` como chave de idempotência
  explícita (linha 29, comentário "Receivers use it as the idempotency
  key") e `correlationId` para correlacionar mensagens relacionadas.
- `CommandRoute = 'local' | 'cloud'` (linha 9) — já modela exatamente a
  decisão que `controlTuyaLocalFirst` (seção 6) implementa hoje de forma
  ad-hoc, sem usar este tipo.
- `DeviceState`, `PresenceHint` (com `confidence: 'low'|'medium'|'high'`,
  usado por `contracts/context.v1.ts` para resolução de contexto),
  `ErrorEnvelope` com `code` de um enum fechado e `retryable: boolean`.
- Validadores de shape em runtime (`isCommandRequest`, `isCommandAck`, etc.)
  e `serialize`/`deserialize` que rejeitam `protocolVersion` incompatível
  ou payload malformado, lançando `ProtocolError` estruturado.

**Achado central:** `contracts/protocol.ts` **não é importado por nenhum
outro arquivo do projeto** além do seu próprio `.selftest.mjs` (grep
confirmou zero resultados para imports do módulo fora de si mesmo). É um
contrato pronto, testado isoladamente, mas 100% desconectado do código que
hoje fala com Tuya/WiZ/Tapo/etc. — cada integração tem seu próprio formato
de request/response ad-hoc (`api/_lib/handlers/tuya.ts`,
`stores/useDeviceStore.ts`). Ou seja: a Fase 1 (#234, Contratos) não
precisa criar este protocolo do zero — ele já existe e já foi desenhado
pensando em `home`/`cloud` como origens e em local/cloud como rota; o
trabalho real da Fase 1 é decidir COMO plugar as integrações existentes
nele (ou se vale a pena, dado que hoje elas funcionam sem isso).

---

## Gaps vs. a spec nova, por fase

- **#234 Contratos** — `contracts/protocol.ts` já existe, versionado,
  testado isoladamente e já modela origem `home`/`cloud`, rota
  `local`/`cloud`, idempotência por `commandId`. Falta: nenhuma integração
  real o usa hoje (Tuya, WiZ, fast path, LLM tool output — tudo fala um
  formato próprio). O trabalho é decidir se/como conectar, não desenhar.

- **#235 Audio core** — Um único `AudioRecord` nunca fechado já existe e
  é o pilar certo para construir em cima. Falta: buffer circular
  pré-wake-word (hoje `armCommandCapture` só começa a gravar DEPOIS da wake
  word confirmada — zero pré-roll), VAD explícito (o corte por silêncio
  hoje é um timer de duas velocidades fixas, não um VAD real), e qualquer
  abstração de "audio core" reutilizável fora do módulo Kotlin específico
  do Vosk.

- **#236 Fast path** — `matchFastDeviceCommand` já é maduro: cobre
  on/off/toggle/brilho/boa-noite, tem bail-out documentado e testado
  contra frases que ele não processa (cor, compostas, >10 palavras,
  ambíguas). Falta: execução hoje é síncrona/mutuamente-exclusiva com a IA
  (sem corrida real ainda), então não há necessidade nem existência de
  deduplicação por `commandId` — isso muda assim que streaming permitir
  fast-path e LLM correrem em paralelo de verdade.

- **#237 Streaming** — Não existe em nenhuma ponta. `api/chat.ts` usa
  `anthropic.messages.create` sem `.stream()`; `api/tts.ts` faz
  `fetch()` + `arrayBuffer()` completo, nunca o endpoint de streaming da
  ElevenLabs. STT (Vosk) já entrega parciais continuamente (isso já é
  "streaming" no sentido local/on-device), mas LLM e TTS são 100%
  full-buffer ponta a ponta. Esta é a lacuna mais profunda das 8 fases.

- **#238 Barge-in** — Não existe nenhum mecanismo de interromper o Argos
  falando. `stopAllSpeech()` existe como botão de mudo manual
  (`textToSpeech.ts:154-157`), mas não é acionado por detecção de fala do
  usuário durante a resposta — teria que ser construído do zero, incluindo
  decidir como o Vosk (que já está sempre ouvindo) discrimina "usuário
  interrompendo" de "eco do próprio TTS" (nenhum mecanismo de AEC/eco
  encontrado no código).

- **#239 Local/cloud** — `controlTuyaLocalFirst` (e o equivalente WiZ) já
  são um precedente funcional real: local com timeout curto (700ms), catch
  silencioso, fallback para nuvem. Falta: é código duplicado por provider,
  não uma abstração compartilhada; `CommandRoute` do protocolo não é usado
  aqui. Nota: o CONTEXT.md está desatualizado nesse ponto (diz "não ligado
  ao store", mas está ligado) — vale corrigir separadamente.

- **#240 UX** — Fora do escopo desta leitura de código de voz per se, mas
  relacionado: follow-up de um turno (`armVoskUtterance` após pergunta do
  Argos) e bipe/vibração de confirmação já existem
  (`voskWakeWord.native.ts:553-554`, disparados de dentro do serviço
  nativo). Sessão contínua multi-turno, indicador visual de estado
  streaming, e barge-in visual não existem.

- **#241 Telemetria** — `perfLog.ts` mede uma fatia (fim-da-fala →
  fast-path/IA → TTS terminado) com marcos nomeados livres, mas nenhuma
  das 14 métricas literais da issue existe como campo nomeado hoje;
  `llm_first_token_ms`/`tts_first_audio_ms`/`barge_in_stop_ms` são
  fisicamente impossíveis de medir sem #237/#238 primeiro (não há "primeiro
  token" nem "primeiro áudio" parcial, e não há barge-in). Nenhum
  mecanismo de consentimento/retenção de áudio para diagnóstico existe
  (áudio capturado é sempre transiente).

- **#242 Hardening** — Vários dos "já tentado e falhou" e "bugs de causa
  raiz já resolvidos" do CONTEXT.md (segundo `AudioRecord`, gramática
  pequena, STT sem gramática, `localStorage` no RN, etc.) já são
  hardening acumulado ao longo do projeto — mas específico do pipeline
  atual (single-turn, sem streaming). Cenários novos da issue #241 (ex.:
  "Claude indisponível, fast path continua", "TTS indisponível, ação não
  duplica/reverte", "dois comandos rápidos consecutivos") não têm teste
  automatizado hoje — dependem do framework de teste que ainda não existe
  no projeto (seção 9).
