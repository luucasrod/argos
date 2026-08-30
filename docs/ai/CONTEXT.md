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

---

## Voz — arquitetura. Não mexa sem ler esta seção inteira

Um **único `AudioRecord`, sempre com gramática, que nunca é fechado**.

- **Vosk** (`react-native-vosk`), modelo pt em `assets/model-pt` (~45 MB)
- Gramática de ~165 entradas: wake word + comandos + nomes de aparelho + iscas
- Aceita: `ei/ola/ok/oi argos` (prefixo) ou `argos escuta/acorda` (sufixo)
- O comando sai da **mesma fala**, após a wake word. Corte por 1,2 s de silêncio
- Bipe e vibração disparam **de dentro do serviço**, não do React
- Foreground service (`react-native-background-actions`), tipo `microphone`

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
| Latência de resposta | Relatada pelo usuário, **ainda não medida** |
| Módulos nativos perdidos | Reescrever como config plugin (ver acima) |
| Deps mortas do Picovoice | Remover do `package.json` |
| Aparelhos fora do vocabulário | `tv`, `4k`, `speaker`, `standing`, `ar-condicionado`, `2` — precisam de apelido falável |
| Prompt cresce sem limite | Toda memória ativa entra em todo pedido. Maior custo de token |
| Controle local Tuya | Código pronto, **não ligado** ao store |
| Tuya 3.4/3.5 | Não suportado (GCM + sessão). Detecta e cai para a nuvem |
| Wake word com tela apagada | Nunca verificado |
| Bipe de confirmação | O código diz que dispara; o usuário só sente a vibração. Verificar no logcat antes de assumir que funciona |
| Segurança no Supabase | Há tabelas com RLS desligado. Detalhes **fora deste arquivo** (repo público) — perguntar ao usuário |
