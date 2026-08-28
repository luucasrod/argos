# Graph Report - argos  (2026-08-28)

## Corpus Check
- 247 files · ~82,862 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 717 nodes · 1385 edges · 73 communities (37 shown, 36 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `452f972e`
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
- zustand
- 🚀 Instalação do Argos APK via ADB
- install-apk.sh script
- install-apk.ps1
- xiaomiPetService.ts
- playMusic.ts
- wiz-devices.ts
- AGENTS.md
- animations.ts
- expo-speech
- @react-native-async-storage/async-storage
- sw.js
- CLAUDE.md
- CONTEXTO OPERACIONAL DO ARGOS
- expo-router
- MAPA DO PROJETO ARGOS

## God Nodes (most connected - your core abstractions)
1. `Colors` - 41 edges
2. `useArgos()` - 38 edges
3. `useAIStore` - 19 edges
4. `expo-router` - 17 edges
5. `SettingsScreen()` - 17 edges
6. `Automation` - 17 edges
7. `GlassCard()` - 16 edges
8. `useHaptic()` - 16 edges
9. `useSettingsStore` - 16 edges
10. `expo` - 15 edges

## Surprising Connections (you probably didn't know these)
- `CreateAutomationModal()` --calls--> `useArgos()`  [EXTRACTED]
  app/(modals)/create-automation.tsx → hooks/useArgos.ts
- `RoutineDetailModal()` --calls--> `useAutomationStore`  [EXTRACTED]
  app/(modals)/routine-detail.tsx → stores/useAutomationStore.ts
- `useTheme()` --calls--> `useSettingsStore`  [EXTRACTED]
  hooks/useTheme.ts → stores/useSettingsStore.ts
- `MemoryScreen()` --calls--> `useMemoryStore`  [EXTRACTED]
  app/(modals)/memory.tsx → stores/useMemoryStore.ts
- `TabsLayout()` --calls--> `useSupabaseSync()`  [EXTRACTED]
  app/(tabs)/_layout.tsx → hooks/useSupabaseSync.ts

## Import Cycles
- 3-file cycle: `services/ai/config.ts -> stores/useSettingsStore.ts -> types/settings.types.ts -> services/ai/config.ts`

## Communities (73 total, 36 thin omitted)

### Community 0 - "useArgos.ts"
Cohesion: 0.09
Nodes (22): styles, ActionCardProps, styles, getGradientColors(), OrbAssembly(), OrbCore(), OrbCoreProps, orbShadowNative (+14 more)

### Community 1 - "Módulos Nativos Kotlin para Argos"
Cohesion: 0.08
Nodes (46): isIOSWeb(), styles, VoiceInstallHelp(), VoiceInstallHelpProps, UseVoiceOptions, VOICE_SPEED_OPTIONS, getSpeechRecognitionCtor(), requestMicPermission() (+38 more)

### Community 2 - "_lib/chrome.ts"
Cohesion: 0.07
Nodes (42): AuthGuard(), ErrorBoundary, errorStyles, rootStyle, AuthGuard(), styles, birthdateToIso(), formatBirthdateInput() (+34 more)

### Community 3 - "voskWakeWord.native.ts"
Cohesion: 0.05
Nodes (36): backgroundColor, foregroundImage, adaptiveIcon, permissions, appJson, typedRoutes, expo, android (+28 more)

### Community 4 - "devices.tsx"
Cohesion: 0.09
Nodes (22): EwelinkCallbackScreen(), styles, CATEGORY_LABELS, DeviceCard(), deviceCardStyle(), stateNumber(), styles, styles (+14 more)

### Community 5 - "playMusic.ts"
Cohesion: 0.11
Nodes (21): ActionListProps, AutomationCard(), AutomationCardProps, PresetAutomationProps, styles, TriggerBadgeProps, PRESET_AUTOMATIONS, PRESET_ROUTINES (+13 more)

### Community 6 - "resetUtterance"
Cohesion: 0.21
Nodes (20): handler(), handler(), handler(), handler(), handler(), ALL_REGIONS, apiHost(), buildAuthorizeUrl() (+12 more)

### Community 7 - "startVoskWakeWord"
Cohesion: 0.15
Nodes (20): OpenAppBanner(), styles, targetFromPending(), APP_LINKS, AppLink, AppOpenTarget, getSupportedAppNames(), isAndroidWeb() (+12 more)

### Community 8 - "DeviceCategory.tsx"
Cohesion: 0.15
Nodes (7): DeviceToggleProps, styles, BottomSheetProps, styles, GradientTextProps, Colors, useTheme()

### Community 9 - "api/xiaomi-pet.ts"
Cohesion: 0.18
Nodes (10): CATEGORY_CONFIG, styles, HabitInsightProps, styles, MemoryCardProps, styles, MemoryStore, Insight (+2 more)

### Community 10 - "tuya.ts"
Cohesion: 0.12
Nodes (16): background_color, categories, description, display, icons, id, lang, name (+8 more)

### Community 11 - "Arquitetura Híbrida: React Native + Kotlin 🔥"
Cohesion: 0.22
Nodes (8): Checklist Rápido Antes de Trabalhar, Comandos Essenciais, GUIA DE USO DIÁRIO — ARGOS + CLAUDE CODE + CODEX, Se Ficou Preso, 🔨 SE FOR BUILDER (implementando uma Issue), 👀 SE FOR REVIEWER (revisando PR de outro builder), Seu papel hoje é BUILDER ou REVIEWER?, URLs Importantes

### Community 12 - "scripts"
Cohesion: 0.09
Nodes (21): dotenv, devDependencies, dotenv, @types/react, typescript, @vercel/node, main, name (+13 more)

### Community 13 - "tuyaLocal.native.ts"
Cohesion: 0.21
Nodes (9): CreateAutomationModal(), styles, AutomationCard(), automationCardStyle(), styles, styles, GlassCard(), GlassCardProps (+1 more)

### Community 16 - "date-fns"
Cohesion: 0.22
Nodes (9): date-fns, expo-linear-gradient, expo-linking, dependencies, date-fns, expo-linear-gradient, expo-linking, tailwindcss (+1 more)

### Community 20 - "expo-build-properties"
Cohesion: 0.17
Nodes (11): expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, nativewind-env.d.ts, **/*.ts, **/*.tsx, compilerOptions, paths (+3 more)

### Community 24 - "expo-linear-gradient"
Cohesion: 0.22
Nodes (7): styles, ExecutionOverlay(), styles, ExecutionStep(), ExecutionStepProps, ICONS, styles

### Community 25 - "expo-linking"
Cohesion: 0.43
Nodes (7): fetchWeatherByCoords(), geocodeCity(), getBrowserLocation(), getWeather(), reverseGeocode(), weatherCodeToDescription(), WeatherResult

### Community 29 - "expo-updates"
Cohesion: 0.39
Nodes (5): collectVoicesOnce(), loadVoices(), reloadVoices(), unlockSpeech(), wait()

### Community 30 - "expo-web-browser"
Cohesion: 0.29
Nodes (6): buildCommand, framework, headers, installCommand, outputDirectory, rewrites

### Community 36 - "react-native-background-actions"
Cohesion: 0.50
Nodes (4): anthropic, handler(), setCorsHeaders(), supabase

### Community 45 - "react-native-vosk"
Cohesion: 0.40
Nodes (4): RoutineDetailModal(), styles, ActionList(), styles

### Community 53 - "install-apk.sh script"
Cohesion: 0.08
Nodes (23): 1. CLAUDE BUILDER, 2. CODEX BUILDER, 3. CLAUDE REVIEWER, 4. CODEX REVIEWER, Autonomia — Limites Duros, Branch Naming, Commit Message Format, Criar Worktree para Builder (+15 more)

### Community 54 - "install-apk.ps1"
Cohesion: 0.50
Nodes (3): config, { getDefaultConfig }, { withNativeWind }

### Community 55 - "xiaomiPetService.ts"
Cohesion: 0.50
Nodes (3): __dir, html, HTML_FILE

### Community 57 - "playMusic.ts"
Cohesion: 0.07
Nodes (51): AutomationsScreen(), ChatScreen(), styles, DevicesScreen(), enter, HomeScreen(), styles, HomeScreenWeb() (+43 more)

### Community 60 - "AGENTS.md"
Cohesion: 0.20
Nodes (9): As CODEX BUILDER: Workflow, As CODEX REVIEWER: Workflow, Before Starting Any Work, CODEX CODE — BUILDER + REVIEWER CONFIGURATION, Expo / React Native Considerations, Expo Versioning Reminder, Key Restrictions (Non-Negotiable), Links (+1 more)

### Community 67 - "CLAUDE.md"
Cohesion: 0.25
Nodes (7): As CLAUDE BUILDER: Workflow, As CLAUDE REVIEWER: Workflow, Before Starting Any Work, CLAUDE CODE — BUILDER + REVIEWER CONFIGURATION, Key Restrictions (Non-Negotiable), Links, Session Identification

### Community 70 - "CONTEXTO OPERACIONAL DO ARGOS"
Cohesion: 0.17
Nodes (11): Arquitetura Vigente, Backend, CONTEXTO OPERACIONAL DO ARGOS, Decisões Vigentes, Documentação de Referência, Estado Conceitual (2026-08-28), Frontend, Pendências Relevantes (+3 more)

### Community 72 - "MAPA DO PROJETO ARGOS"
Cohesion: 0.33
Nodes (5): Bloqueadores Críticos, Estrutura Arquitetural, Fluxo de Dados Crítico: Voz → Controle de Dispositivo, MAPA DO PROJETO ARGOS, Maturidade por Módulo (2026-08-28)

## Knowledge Gaps
- **252 isolated node(s):** `🔨 SE FOR BUILDER (implementando uma Issue)`, `👀 SE FOR REVIEWER (revisando PR de outro builder)`, `URLs Importantes`, `Checklist Rápido Antes de Trabalhar`, `Se Ficou Preso` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `date-fns` to `scripts`, `dependencies`, `babel-preset-expo`, `expo`, `expo-av`, `expo-blur`, `expo-constants`, `expo-font`, `expo-haptics`, `expo-router`, `expo-status-bar`, `expo-system-ui`, `lottie-react-native`, `nativewind`, `react`, `react-dom`, `react-native`, `react-native-gesture-handler`, `react-native-linear-gradient`, `react-native-mmkv`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `@react-native-voice/voice`, `react-native-web`, `react-native-worklets`, `@supabase/supabase-js`, `zustand`, `expo-speech`, `@react-native-async-storage/async-storage`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `SettingsScreen()` connect `_lib/chrome.ts` to `Módulos Nativos Kotlin para Argos`, `react`, `devices.tsx`, `expo-router`, `playMusic.ts`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `date-fns`, `_lib/chrome.ts`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **What connects `🔨 SE FOR BUILDER (implementando uma Issue)`, `👀 SE FOR REVIEWER (revisando PR de outro builder)`, `URLs Importantes` to the rest of the system?**
  _252 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useArgos.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08571428571428572 - nodes in this community are weakly interconnected._
- **Should `Módulos Nativos Kotlin para Argos` be split into smaller, more focused modules?**
  _Cohesion score 0.07720782654680064 - nodes in this community are weakly interconnected._
- **Should `_lib/chrome.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06656426011264721 - nodes in this community are weakly interconnected._