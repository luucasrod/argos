# CONTEXT — Argos

Verdade técnica consolidada. Leia isto **antes** de escrever código. Estado
operacional (fila, quem faz o quê) fica no GitHub, não aqui.

---

## O produto

Assistente de voz em português. O produto real é o **APK Android nativo**
(Expo/RN SDK 54, build local). O PWA em `argos-blue.vercel.app` é secundário.
API serverless no Vercel (`/api/*`), Supabase para auth/memórias/tokens.

Pacote Android: `com.masya.argos`. Canal de OTA: `preview`.

**Funciona hoje:** wake word + comando por voz on-device em background;
controle de Tuya, eWeLink, WiZ, Tapo, Xiaomi, Alexa, Chrome/Google Home;
OTA aplicando em uma única abertura; build local sem cota EAS.

Home Assistant é uma integração **unidirecional HA → Argos**: o HA envia texto
para `/api/ha` usando a chave gerada no app, e o Argos executa nas integrações
que ele próprio conhece. O app não lê nem controla entidades cadastradas somente
no Home Assistant, portanto elas não aparecem na aba Casa.

### Device Registry

`services/devices/deviceRegistry.ts` é a camada canônica entre discovery e o
store. Todo dispositivo registrado tem `provider`, `nativeId`, `roomId`,
`capabilities`, `online`, `metadata` e `aliases`; renomear ou reimportar preserva
`nativeId`. O store migra automaticamente os registros persistidos antigos.
Snapshots destinados à cloud usam `toCloudDeviceSnapshot()` e não incluem
`state` nem `metadata`, que podem conter dados voláteis ou sensíveis.

### Permissões por risco

`contracts/actionPermissions.v1.ts` é a política canônica para autorização de
ações. A capability define o risco; origem remota, presença local, permissão,
confirmação específica e reautenticação determinam a decisão. Autorizar uma
ação trivial nunca autoriza uma ação sensível, e personalidade/tom não participa
da política. Capabilities desconhecidas usam risco alto por padrão.

### Contexto e precedência

`contracts/context.v1.ts` é o contrato canônico de `ContextSnapshot`. A resolução
é determinística e segue: comando explícito > conversa > contexto local confiável
> preferência confirmada > inferência. Evidências conflitantes no nível vencedor,
ausentes ou abaixo do limiar de confiança retornam uma pergunta curta de
clarificação; inferência nunca sobrepõe uma instrução explícita.

---

## Voz — arquitetura. Não mexa sem ler esta seção inteira

Um **único `AudioRecord`, sempre com gramática, que nunca é fechado**.

- **Módulo nativo próprio `ArgosVoice`** (issue #215, `plugins/native/ArgosVoiceModule.kt`,
  injetado via `plugins/withArgosVoiceModule.js`) — substitui o `SpeechService`
  de `react-native-vosk`. É dono direto do `AudioRecord` e chama
  `org.vosk.Recognizer.acceptWaveForm()` (API pública de baixo nível do Vosk,
  o mesmo que o `SpeechService` chama por baixo) numa thread própria que
  **nunca para** enquanto a escuta estiver ativa — sem restart por utterance
  como o `SpeechService` antigo exigia.
- Modelo pt em `assets/model-pt` (~45 MB), carregado por esse módulo
- Gramática de ~165 entradas: wake word + comandos + nomes de aparelho + iscas
- Aceita: `ei/ola/ok/oi argos` (prefixo) ou `argos escuta/acorda` (sufixo)
- O comando sai da **mesma fala**, após a wake word. Corte por ~1s de silêncio
- Bipe e vibração disparam **de dentro do serviço**, não do React
- Foreground service (`react-native-background-actions`), tipo `microphone`
- `react-native-vosk` (a lib de terceiro) continua no projeto só pelo plugin
  dela de empacotamento do modelo (asset versioning) — o JS não chama mais
  nenhuma função dela; `services/voice/argosVoiceNative.ts` fala com o
  `ArgosVoice` próprio.

### Pergunta livre no comando → Whisper em nuvem

A gramática fechada não entende "moro em Leiria, como está o clima" — não é
bug, é vocabulário fechado (ver "Regra geral de vocabulário" abaixo).
Vocabulário aberto local (item 6 de "Já tentado e FALHOU") foi tentado e não
resolveu bem o suficiente. Solução (issue #215, 04/09/2026):

- `ArgosVoiceModule` guarda o áudio bruto do trecho do comando em paralelo
  (PCM16 mono 16kHz), só enquanto `armed` (depois da wake word).
- Quando o texto que a gramática reconheceu fica vazio ou curto demais pra
  duração da fala (heurística que já existia pra registrar tentativa
  suspeita — `services/voice/voskWakeWord.native.ts`, `SUSPICIOUS_*`), o
  áudio vira WAV (cabeçalho RIFF de 44 bytes, `ArgosVoiceModule.wrapPcmAsWav`)
  e vai pro **endpoint que já existia**, `api/transcribe.ts` (Whisper via
  `OPENAI_API_KEY`) — o mesmo que o fluxo de toque-no-orb usa
  (`services/voice/customCapture.web.ts`). Não foi preciso criar endpoint
  novo, só um cliente novo (`services/voice/commandAudioTranscribe.native.ts`).
- Comando comum ("liga a luz") nunca passa pela nuvem — a gramática já
  acerta, mais rápido e sem custo de rede.
- Sem `OPENAI_API_KEY` configurada, `api/transcribe.ts` devolve 503 e o app
  fica com o texto (possivelmente vazio) da gramática — silencioso, mesmo
  padrão do fallback de TTS.
- **Achado nesta sessão**: `api/transcribe.ts` e o fluxo de toque-no-orb já
  existiam e não estavam documentados aqui — foi assim que passou
  despercebido. Antes de propor endpoint de STT novo, conferir aqui primeiro.

### ⚠️ REGRA CRÍTICA: acento na gramática

**O vocabulário do modelo pt tem 99.101 palavras e guarda as formas
ACENTUADAS.** `escritório`, `lâmpada`, `próxima`, `não`, `já`, `então`, `põe`,
`música`, `está` existem. As formas sem acento **não existem**.

Mandar `escritorio` para a gramática faz o Vosk **descartar a entrada inteira**
com um aviso que ninguém lê:

```
W/VoskAPI: Ignoring word missing in vocabulary: 'escritorio'
```

A palavra vira **impossível de falar**. Isso passou despercebido por semanas e
foi diagnosticado como "o celular ouve mal".

Por isso existem duas funções em `services/voice/voskWakeWord.native.ts`:

| função | usar em | acento |
|---|---|---|
| `toGrammar()` | o que vai para a **gramática** do Vosk | **mantém** |
| `normalize()` | o texto **ouvido** e os padrões de comparação | remove |

Trocar as duas quebra o reconhecimento **em silêncio**. Ao adicionar qualquer
comando novo, valide cada palavra contra o vocabulário do modelo antes de
confiar — extrair de `assets/model-pt/Gr.fst` (tabela de símbolos OpenFst:
int32 com o tamanho, seguido dos bytes UTF-8).

Palavras que continuam fora do modelo por serem estrangeiras ou numéricas e
que aparecem em nome de aparelho: `tv`, `4k`, `speaker`, `standing`,
`ar-condicionado`, `2`. Esses aparelhos precisam de um apelido falável.

### Falso positivo

O usuário **prefere perder chamadas reais a ter o Argos respondendo sozinho**.
Isso é decisão de produto, não bug a "melhorar".

- `NAME_ALT` é só `argos|argus|argo`. "arcos", "airbus", "argox" e "hargos"
  foram removidos — são sons comuns na fala normal.
- `WAKE_PREFIX_WORDS` é `['ei','ola','ok','oi']`. `'e'` e `'a'` foram
  **removidos**: vogais soltas são as palavras mais comuns do português e, com
  gramática fechada, qualquer ruído era forçado para a entrada `"e argos"`.
- O padrão "nome sozinho no início da frase" foi removido. **Sempre** exige
  prefixo ou sufixo.

### Regra geral de vocabulário

**Todo comando que o backend aceita por texto precisa entrar na gramática
também**, ou por voz nunca vai funcionar. Não é falha da IA — é vocabulário
fechado. Foi exatamente o que aconteceu com os comandos de cor.

---

## Build nativo e OTA — armadilhas que já custaram caro

### `android/` é gitignored

É regenerado por `expo prebuild` e **nunca** commitado. Qualquer módulo Kotlin
escrito à mão lá dentro **desaparece** no próximo prebuild.

**Já aconteceu:** `WizUdpModule.kt`, `WakeWordModule.kt` e `WakeWordPackage.kt`
foram perdidos, junto com a dependência `onnxruntime` no `build.gradle`. Não
existe cópia no git. A única cópia compilada do `WizUdpModule` está no APK de
backup em `A:\Argos\argos-backup-apk\base.apk`.

→ Módulo nativo só deve ser adicionado através de um **config plugin** em
`plugins/`, que o prebuild reaplica. Use `plugins/withForegroundService.js`
como modelo. **Não rode `expo prebuild` sem isso.**

### `version` travada em 1.0.0

`runtimeVersion` usa a política `appVersion`, e `version` nunca subiu de
`"1.0.0"`. Consequência: **todo APK já gerado compartilha o mesmo runtime**, e
o servidor de OTA entrega o mesmo bundle JS para qualquer um deles — inclusive
JS novo sobre nativo velho.

→ **Suba `version` sempre que mexer no nativo.** Senão a fronteira entre JS e
nativo deixa de existir.

### Publicar OTA faz parte de mexer no JS

Já ficaram **3 semanas** de correções paradas no repositório porque ninguém
publicou. O app não estava velho por bug — estava velho por falta de publicação.

```
npx eas update --branch preview --message "o que mudou"
```

Conferir no aparelho depois:

```
adb logcat -d | grep "Stored update found"
```

---

## Já tentado e FALHOU — não repita

1. **STT de texto livre (sem gramática).** O modelo pequeno **nunca** produz
   "argos". A voz real saiu como `erros`, `e aguas`, `em angulos`, `e os`.
   Gramática fechada é obrigatória.
2. **Fechar o microfone e reabrir noutro modo.** O Android **nega** abrir
   microfone novo com o app em background. O áudio morria e não voltava.
   → Nunca crie um segundo `AudioRecord`.
3. **Gramática pequena (3–6 entradas).** Qualquer ruído escorregava para a wake
   word. Daí a lista grande de iscas.
4. **`react-native-udp`.** Módulo de arquitetura antiga; o projeto roda com
   `newArchEnabled=true` (obrigatório por causa de `react-native-mmkv`/Nitro).
   O app **crashava no boot**: `[runtime not ready] ... JavaScriptContextHolder`.
   Revertido por completo. Para UDP, use módulo nativo próprio (Kotlin +
   `DatagramSocket`, TurboModule) via config plugin.
5. **Picovoice para wake word.** O tier grátis acabou em 30/06/2026. As deps
   `@picovoice/porcupine-react-native` e
   `@picovoice/react-native-voice-processor` continuam no `package.json`
   **sem nenhum import no código** e entram por autolink em qualquer build
   nativo. Devem ser removidas.

**Lição transversal:** typecheck limpo não prova nada sobre módulo nativo. Só
build + instalação real + logcat provam.

---

## `api/` — limite de Serverless Functions (Vercel Hobby)

O plano Hobby só permite **12 Serverless Functions por deployment** — cada
arquivo direto em `api/` conta como uma. Em 04/09/2026 o projeto chegou a
**14** e todo deploy passou a falhar com:

```
Error: No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

`npx vercel deploy --prod` sem `--debug` mostra só `"Not authorized"` —
mensagem genérica que não tem nada a ver com autenticação. **Sempre rodar
com `--debug` quando um deploy falhar sem motivo óbvio.**

Solução: rotas que fazem a mesma coisa (proxy de integração de aparelho)
viram **uma rota dinâmica só**. `api/devices/[provider].ts` despacha por
`req.query.provider` pra handlers que moraram em `api/_lib/handlers/*.ts` —
a exclusão da contagem vem do prefixo `_` no nome da pasta (convenção do
Vercel), não simplesmente de estar fora de `api/devices/`. URLs antigas (`/api/wiz`,
`/api/tapo`, etc.) continuam funcionando via `rewrites` no `vercel.json` —
nenhum client precisou mudar. `api/ewelink.ts` já usava essa mesma ideia
internamente (`?action=`) antes de virar rota dinâmica também.

⚠️ **Ao adicionar um arquivo novo direto em `api/`**, contar quantos existem
(`find api -maxdepth 1 -name "*.ts" | wc -l`) antes de imaginar que "só mais
um arquivo" é inofensivo — o teto de 12 volta rápido.

---

## Voz de saída (TTS)

- Neural via **ElevenLabs** (`eleven_flash_v2_5`), com queda **silenciosa** para
  a voz do sistema quando falha.
- `api/tts.ts` escolhe a voz por `personality.voiceGender`: `sarah` (feminina)
  ou `george` (masculina). `nassif` (sotaque BR nativo) só funciona em plano
  pago — no grátis dá 402 e cai calado para a voz do sistema.
- **Cota grátis: 10.000 caracteres/mês.** Ao estourar, volta para a voz do
  sistema sem erro visível. É a explicação mais provável para "a voz piorou".
- Diagnóstico sem login: `GET /api/tts` mostra provedores e cota;
  `GET /api/tts?probe=1` sintetiza de verdade e devolve o tamanho do áudio.
- `speed` do ElevenLabs só aceita 0.7–1.2 (a escala do app é 0.5–2.0). Fora da
  faixa dá 422 e cai para a voz antiga sem aviso.
- Se `GET /api/tts` acusar erro de auth depois de "trocar a chave", **suspeite
  de variável marcada "Sensitive" no Vercel** antes de qualquer outra causa —
  ela impede reler o valor salvo, e o erro se repete silenciosamente.
- **Fallback do sistema:** se não houver voz masculina pt-BR instalada,
  `pickVoiceForPersonality` devolve `null`, o app usa a voz padrão (feminina) e
  aplica `pitch = 0.72`. É isso que soa robótico — voz feminina com tom forçado
  para baixo.
- **Sotaque troca sozinho pra PT-PT no meio de uma conversa em pt-BR**
  (relatado 06/09/2026, ainda sem causa raiz confirmada — issue #B-044).
  Hipótese: o modelo multilíngue (`eleven_flash_v2_5`) infere sotaque pelo
  CONTEÚDO do texto (ex.: nome de cidade portuguesa como "Leiria"), não por
  parâmetro fixo. **Tentativa que NÃO foi feita** por risco: adicionar
  `language_code: 'pt'` no request — a doc da ElevenLabs só confirma que
  esse campo **não** funciona no `multilingual_v2`, nada diz sobre o
  `eleven_flash_v2_5` real usado aqui, e só aceita ISO 639-1 de 2 letras
  (não distingue pt-BR de pt-PT mesmo se funcionasse). Se a API rejeitar o
  campo, o TTS inteiro cai pro Azure/sistema — trocaria um bug raro por
  perder a voz premium sempre. Não tentar sem ouvir o resultado no aparelho.

---

## Bugs de causa raiz já resolvidos (não reintroduzir)

- **`localStorage` no React Native.** `useDeviceStore` persistia em
  `localStorage`, que não existe no RN. Zustand lançava TypeError em toda
  mutação, depois de aplicar o estado — a lâmpada nunca recebia comando e o app
  caía com tela preta. → usar `AsyncStorage`.
- **`lastInputMode` global.** É uma flag no `useAIStore` que `speak()` usa para
  não falar por cima de quem digitou. Só a tela de chat a setava; a tela
  principal, onde a wake word vive, não. Bastava digitar uma vez para o Argos
  ficar **mudo para sempre** na tela principal. Toda entrada por voz precisa
  marcar `'voice'`.
- **Tuya com dois códigos.** A leitura aceitava `switch_led` OU `switch`, mas o
  envio mandava sempre `switch_led`. Em lâmpada cujo código real é `switch`, o
  comando era rejeitado pela nuvem sem erro visível. →
  `tuyaControlWithFallback` tenta os dois.
- **Atalho rápido engolindo a frase.** `matchFastDeviceCommand` reconhecia só um
  verbo e devolvia o intent, descartando o resto ("liga a luz **e deixa
  vermelho**"). → **o atalho só pode tratar do que ele mesmo sabe fazer;
  qualquer coisa a mais na frase, devolve `null` e deixa para a IA.**
- **Manifest do foreground service.** Um typo em
  `plugins/withForegroundService.js` deixava o service sem
  `foregroundServiceType`; o Android 14+ recusa e nenhum OTA chegava.
- **Canal de OTA.** Build local não herda o canal do EAS. Sem
  `expo-channel-name` em `updates.requestHeaders` (`app.json`), nenhum OTA
  chega ao aparelho.
- **`GlassCard` + `flexDirection: 'row'` no `style` passado por fora colapsa
  os filhos.** `components/ui/GlassCard.tsx` aplica o `style` recebido no
  View EXTERNO (`container`), mas quem envolve os `children` é um View
  INTERNO (`content`) sem `flex` próprio. `content`, como filho único de um
  `container` em modo linha, não herda a largura do pai — `stretch`
  (comportamento padrão do RN) só vale no eixo CRUZADO, que em `row` é
  altura, não largura. Sem `flex`/`width` explícito, `content` colapsa pro
  tamanho mínimo dos filhos, e qualquer filho com `flex: 1` lá dentro (um
  `TextInput`, por exemplo) encolhe a quase zero — foi assim que o
  placeholder da caixa de texto da Home "sumiu" (#A-065): o `TextInput` não
  tinha onde renderizar. Dois jeitos de evitar: (1) não passar
  `flexDirection: 'row'` pro `GlassCard` — se os filhos já se organizam em
  linha por conta própria (um `<View style={{flexDirection:'row'}}>`
  manual, como em `conversar.tsx`), deixar o `GlassCard` em coluna padrão
  resolve, porque aí o `stretch` padrão já cobre a largura; (2) se
  precisar mesmo do `container` em linha, dar `flex: 1` pro wrapper
  interno também. `app/(tabs)/index.tsx` tinha as duas coisas ao mesmo
  tempo (row no `GlassCard` E um wrapper manual em row por dentro) —
  redundante e foi isso que colapsou.
- **Exemplo literal em few-shot do prompt vaza pro output real.** O
  schema JSON do intent `get_weather` em `services/ai/systemPrompt.ts`
  tinha `"cityName": "São Paulo"` como exemplo — quando o modelo não tinha
  certeza da cidade (usuário mencionou uma cidade que o parser não
  reconheceu, ou não mencionou nenhuma), ele **ecoava o valor do exemplo**
  em vez de seguir a instrução em texto ("se não mencionar, omita o
  campo"). Confirmado em teste real (06/09/2026): perguntar o clima em
  Santarém devolveu o clima de São Paulo. → **Nunca colocar um valor
  plausível e específico como exemplo de um campo opcional/derivado da
  fala** — mostrar o JSON de exemplo SEM o campo, e descrever a regra de
  quando incluí-lo à parte. Vale para qualquer campo parecido que for
  adicionado no futuro (nome de cidade, nome de dispositivo, valor livre).

---

## Convenções

- Checagem: `npx tsc --noEmit`. **Limpo = 3 erros pré-existentes**, em
  `api/xiaomi-pet.ts` (2) e `app/(tabs)/perfil.tsx` (1). Qualquer erro além
  desses foi você que causou.
- Não há lint nem testes configurados.
- `expo-av` está deprecado e sai no SDK 54 → migrar para
  `expo-audio` / `expo-video`.
- Docs oficiais do Expo, versão exata:
  https://docs.expo.dev/versions/v54.0.0/

---

## Pendências conhecidas

| Item | Situação |
|---|---|
| Voz neural | Cota grátis estourada. Decidir: plano pago, Azure (o código já prevê o caminho) ou esperar o reset |
| Latência de resposta | `COMMAND_SILENCE_MS` já baixou de 1200 para 800ms (issue #14). Instrumentação por etapa pronta em `services/voice/perfLog.ts` (fim da fala → intent/LLM → TTS → áudio), log com prefixo `[argos-perf]` no logcat (tag `ReactNativeJS`). **Falta**: rodar no aparelho numa interação real e escrever o relatório de qual etapa domina — pendente de acesso físico ao celular |
| Módulos nativos perdidos | Reescrever como config plugin (ver acima) |
| Deps mortas do Picovoice | Remover do `package.json` |
| Aparelhos fora do vocabulário | `tv`, `4k`, `speaker`, `standing`, `ar-condicionado`, `2` — precisam de apelido falável |
| Prompt cresce sem limite | Toda memória ativa entra em todo pedido. Maior custo de token |
| Controle local Tuya | Código pronto, **não ligado** ao store |
| Tuya 3.4/3.5 | Não suportado (GCM + sessão). Detecta e cai para a nuvem |
| Wake word com tela apagada | Nunca verificado |
| Bipe de confirmação | O código diz que dispara; o usuário só sente a vibração. Verificar no logcat antes de assumir que funciona |
| Segurança no Supabase | Há tabelas com RLS desligado. Detalhes **fora deste arquivo** (repo público) — perguntar ao usuário |
| Módulo nativo de áudio próprio + STT em nuvem (Whisper) | Implementado (issue #215: `ArgosVoiceModule.kt` substitui o `SpeechService` de `react-native-vosk`, comando em pergunta livre cai no `api/transcribe.ts` já existente), PR #224 aberto mas com **alterações solicitadas na revisão cruzada**: race condition no `cleanup()` do módulo Kotlin (fecha `AudioRecord`/`recognizer` sem esperar a thread do loop de gravação terminar) e guard de sessão faltando em `voskWakeWord.native.ts` (um `cancel` + novo `start` antes do Whisper resolver pode entregar o texto da fala cancelada como se fosse da nova). Ainda precisa também de validação em aparelho real antes de aceitar — não documentado aqui como arquitetura corrente até integrar |
| Sotaque PT-PT aparecendo sozinho (TTS) | #B-044, ver seção de TTS acima — investigado, tentativa óbvia descartada por risco, sem correção ainda |
