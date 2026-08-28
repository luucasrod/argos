# Graph Report - argos  (2026-08-04)

## Corpus Check
- 189 files · ~127,141 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 383 nodes · 496 edges · 60 communities (19 shown, 41 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b9f8236`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useArgos.ts
- Módulos Nativos Kotlin para Argos
- _lib/chrome.ts
- voskWakeWord.native.ts
- devices.tsx
- playMusic.ts
- resetUtterance
- startVoskWakeWord
- DeviceCategory.tsx
- api/xiaomi-pet.ts
- tuya.ts
- Arquitetura Híbrida: React Native + Kotlin 🔥
- scripts
- tuyaLocal.native.ts
- dependencies
- babel-preset-expo
- date-fns
- expo
- expo-av
- expo-blur
- expo-build-properties
- expo-constants
- expo-font
- expo-haptics
- expo-linear-gradient
- expo-linking
- expo-router
- expo-status-bar
- expo-system-ui
- expo-updates
- expo-web-browser
- lottie-react-native
- nativewind
- react
- react-dom
- react-native
- react-native-background-actions
- react-native-gesture-handler
- react-native-linear-gradient
- react-native-mmkv
- react-native-reanimated
- react-native-safe-area-context
- react-native-screens
- react-native-svg
- @react-native-voice/voice
- react-native-vosk
- react-native-web
- react-native-worklets
- @supabase/supabase-js
- tailwindcss
- @types/aes-js
- zustand
- 🚀 Instalação do Argos APK via ADB
- install-apk.sh script
- xiaomiPetService.ts
- device.types.ts
- playMusic.ts
- VoiceActivationButton.tsx
- wiz-devices.ts

## God Nodes (most connected - your core abstractions)
1. `🚀 Instalação do Argos APK via ADB` - 11 edges
2. `Arquitetura Híbrida: React Native + Kotlin 🔥` - 10 edges
3. `useArgos()` - 10 edges
4. `startVoskWakeWord()` - 10 edges
5. `🎤 ARGOS VOZ — IMPLEMENTAÇÃO COMPLETA` - 9 edges
6. `📋 O Que Foi Implementado` - 9 edges
7. `scripts` - 9 edges
8. `handler()` - 9 edges
9. `Módulos Nativos Kotlin para Argos` - 8 edges
10. `resetUtterance()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `VoiceActivationButton()` --calls--> `useVoiceActivation()`  [EXTRACTED]
  components/VoiceActivationButton.tsx → hooks/useVoiceActivation.ts
- `useArgos()` --calls--> `parseAIResponse()`  [EXTRACTED]
  hooks/useArgos.ts → services/ai/intentParser.ts
- `useArgos()` --calls--> `buildSystemPrompt()`  [EXTRACTED]
  hooks/useArgos.ts → services/ai/systemPrompt.ts
- `useArgos()` --calls--> `resolveIntentSpeech()`  [EXTRACTED]
  hooks/useArgos.ts → services/voice/speechText.ts
- `useArgos()` --calls--> `textToSpeech()`  [EXTRACTED]
  hooks/useArgos.ts → services/voice/textToSpeech.ts

## Import Cycles
- None detected.

## Communities (60 total, 41 thin omitted)

### Community 0 - "useArgos.ts"
Cohesion: 0.11
Nodes (23): buildConfirmationInfo(), needsConfirmation(), useArgos(), withTimeout(), parseAIResponse(), ParsedIntent, buildSystemPrompt(), openMusicApp() (+15 more)

### Community 1 - "Módulos Nativos Kotlin para Argos"
Cohesion: 0.12
Nodes (16): 1. Registrar módulo no Package, 1. WakeWordDetector, 2. DeviceControlModule, 2. Registrar no MainApplication.kt, 3. Usar do JavaScript/TypeScript, Como Conectar React Native ↔ Kotlin, Estrutura, Fase 1: Setup (próximo sprint) (+8 more)

### Community 2 - "_lib/chrome.ts"
Cohesion: 0.29
Nodes (12): cors(), handler(), buildAuthorizeUrl(), controlChromeDevice(), ControlCommand, disconnectChrome(), exchangeCodeForTokens(), getUserFromAuthHeader() (+4 more)

### Community 3 - "voskWakeWord.native.ts"
Cohesion: 0.14
Nodes (28): armSilence(), armVoskUtterance(), buildGrammar(), buildWakePatterns(), cancelVoskUtterance(), clearSilence(), clearSubs(), COMMAND_PHRASES (+20 more)

### Community 4 - "devices.tsx"
Cohesion: 0.24
Nodes (9): BRIGHTNESS_STEPS, byCustomOrder(), CATEGORY_LABELS, COLOR_PRESETS, DeviceCard(), DevicesScreen(), FAN_SPEED_STEPS, stateNumber() (+1 more)

### Community 5 - "playMusic.ts"
Cohesion: 0.08
Nodes (24): 1. **Build APK**, ✅ 1. **Sistema de Logging Centralizado**, ✅ 2. **Captura de Áudio (Audio Processor)**, 2. **Instalar no Celular**, 3. **Testar**, ✅ 3. **Wake Word Detection (TensorFlow Lite)**, 4. **Se Falhar, Diagnosticar**, ✅ 4. **Speech-to-Text (STT)** (+16 more)

### Community 6 - "resetUtterance"
Cohesion: 0.21
Nodes (11): authHeaders(), controlTuyaDevice(), disconnectTuya(), exchangeTuyaCode(), fetchTuyaDevices(), getTuyaAuthorizeUrl(), loginTuya(), TuyaDeviceInfo (+3 more)

### Community 7 - "startVoskWakeWord"
Cohesion: 0.22
Nodes (4): PET_DEVICE_MODELS, TODO: Implementar descoberta de specs para dispositivos pet via miot-spec.org, XiaomiPetDeviceDto, XiaomiPetSpec

### Community 8 - "DeviceCategory.tsx"
Cohesion: 0.40
Nodes (3): DeviceCategoryProps, LABELS, styles

### Community 10 - "tuya.ts"
Cohesion: 0.10
Nodes (27): buildHeaders(), calcSign(), exchangeTuyaCode(), getProjectCredentials(), getValidTuyaCredentials(), hsvToHex(), LIGHT_CATEGORIES, mapTuyaDevices() (+19 more)

### Community 11 - "Arquitetura Híbrida: React Native + Kotlin 🔥"
Cohesion: 0.09
Nodes (22): 1. **WakeWordDetector** (`modules/WakeWordDetector.kt`), 2. **DeviceControlModule** (`modules/DeviceControlModule.kt`), 3. **AudioProcessor** (`modules/AudioProcessor.kt`), 4. **BackgroundService** (`modules/BackgroundService.kt`), Arquitetura Híbrida: React Native + Kotlin 🔥, 🌉 Bridge React Native ↔ Kotlin, 📋 Checklist de Implementação, 🔑 Dependências Necessárias (+14 more)

### Community 12 - "scripts"
Cohesion: 0.09
Nodes (22): dotenv, devDependencies, dotenv, @types/react, typescript, @vercel/node, main, name (+14 more)

### Community 13 - "tuyaLocal.native.ts"
Cohesion: 0.22
Nodes (19): buildControlPayload(), buildFrame(), bytesToStr(), concat(), crc32(), CRC_TABLE, decrypt(), encrypt() (+11 more)

### Community 14 - "dependencies"
Cohesion: 0.18
Nodes (11): aes-js, @anthropic-ai/sdk, expo-speech, dependencies, aes-js, @anthropic-ai/sdk, expo-speech, @react-native-async-storage/async-storage (+3 more)

### Community 52 - "🚀 Instalação do Argos APK via ADB"
Cohesion: 0.17
Nodes (11): Após Instalação, Arquivo de Log no Dispositivo, 📱 Checklist de Testes, Desinstalar se Precisar, 🚀 Instalação do Argos APK via ADB, Instalação Rápida (Mac/Linux), Instalação Rápida (Windows/PowerShell), Pré-requisitos (+3 more)

### Community 55 - "xiaomiPetService.ts"
Cohesion: 0.60
Nodes (4): authHeaders(), controlXiaomiPetDevice(), fetchXiaomiPetDevices(), XiaomiPetDeviceInfo

### Community 56 - "device.types.ts"
Cohesion: 0.40
Nodes (4): Device, DeviceCapability, DeviceCategory, DeviceStatus

### Community 58 - "VoiceActivationButton.tsx"
Cohesion: 0.60
Nodes (3): styles, VoiceActivationButton(), useVoiceActivation()

## Knowledge Gaps
- **159 isolated node(s):** `supabaseAdmin`, `enter`, `styles`, `styles`, `✅ 1. **Sistema de Logging Centralizado**` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `scripts`, `babel-preset-expo`, `date-fns`, `expo`, `expo-av`, `expo-blur`, `expo-build-properties`, `expo-constants`, `expo-font`, `expo-haptics`, `expo-linear-gradient`, `expo-linking`, `expo-router`, `expo-status-bar`, `expo-system-ui`, `expo-updates`, `expo-web-browser`, `lottie-react-native`, `nativewind`, `react`, `react-dom`, `react-native`, `react-native-background-actions`, `react-native-gesture-handler`, `react-native-linear-gradient`, `react-native-mmkv`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `@react-native-voice/voice`, `react-native-vosk`, `react-native-web`, `react-native-worklets`, `@supabase/supabase-js`, `tailwindcss`, `@types/aes-js`, `zustand`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **What connects `supabaseAdmin`, `enter`, `styles` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useArgos.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11491935483870967 - nodes in this community are weakly interconnected._
- **Should `Módulos Nativos Kotlin para Argos` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `voskWakeWord.native.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1350806451612903 - nodes in this community are weakly interconnected._
- **Should `playMusic.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `tuya.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10080645161290322 - nodes in this community are weakly interconnected._