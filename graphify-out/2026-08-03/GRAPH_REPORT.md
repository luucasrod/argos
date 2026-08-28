# Graph Report - argos  (2026-08-03)

## Corpus Check
- 179 files · ~120,158 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 139 nodes · 223 edges · 9 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `00843e33`
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

## God Nodes (most connected - your core abstractions)
1. `useArgos()` - 10 edges
2. `startVoskWakeWord()` - 10 edges
3. `handler()` - 9 edges
4. `Módulos Nativos Kotlin para Argos` - 8 edges
5. `resetUtterance()` - 8 edges
6. `handle()` - 8 edges
7. `buildGrammar()` - 7 edges
8. `submit()` - 6 edges
9. `stripForSpeech()` - 5 edges
10. `textToSpeech()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `DeviceStore` --references--> `Device`  [EXTRACTED]
  stores/useDeviceStore.ts → types/device.types.ts
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

## Communities (9 total, 0 thin omitted)

### Community 0 - "useArgos.ts"
Cohesion: 0.15
Nodes (18): buildConfirmationInfo(), needsConfirmation(), useArgos(), withTimeout(), parseAIResponse(), ParsedIntent, buildSystemPrompt(), EMOJI_RE (+10 more)

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
Cohesion: 0.53
Nodes (5): openMusicApp(), openSearchFallback(), playMusic(), PlayMusicResult, searchUrl()

### Community 6 - "resetUtterance"
Cohesion: 0.17
Nodes (11): authHeaders(), controlXiaomiPetDevice(), fetchXiaomiPetDevices(), XiaomiPetDeviceInfo, DeviceStore, useDeviceStore, WizLocalSavedDevice, Device (+3 more)

### Community 7 - "startVoskWakeWord"
Cohesion: 0.26
Nodes (8): detectPetDeviceType(), PET_DEVICE_MODELS, TODO: Implementar descoberta de specs para dispositivos pet via miot-spec.org, xiaomiGetPetSpec(), XiaomiPetDeviceDto, XiaomiPetSpec, cors(), handler()

### Community 8 - "DeviceCategory.tsx"
Cohesion: 0.40
Nodes (3): DeviceCategoryProps, LABELS, styles

## Knowledge Gaps
- **38 isolated node(s):** `XiaomiPetSpec`, `PET_DEVICE_MODELS`, `XiaomiPetDeviceInfo`, `WizLocalSavedDevice`, `useDeviceStore` (+33 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useArgos()` connect `useArgos.ts` to `playMusic.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `XiaomiPetSpec`, `PET_DEVICE_MODELS`, `XiaomiPetDeviceInfo` to the rest of the system?**
  _38 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useArgos.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1476923076923077 - nodes in this community are weakly interconnected._
- **Should `Módulos Nativos Kotlin para Argos` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `voskWakeWord.native.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1350806451612903 - nodes in this community are weakly interconnected._