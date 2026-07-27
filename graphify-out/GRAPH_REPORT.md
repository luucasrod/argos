# Graph Report - argos  (2026-07-26)

## Corpus Check
- 168 files · ~109,486 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1175 nodes · 2172 edges · 112 communities (72 shown, 40 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5654c546`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Integrações de Dispositivos
- Captura de Voz e VAD
- Bootstrap do App e Auth
- Modais e UI Base
- Ajuda de Voz e TTS
- API Home Assistant e Prompt
- Tela e Controles de Dispositivos
- Orb e Bolhas de Chat
- Agenda e Rotinas
- API Xiaomi
- API Tuya
- Automações
- Memória e Inteligência
- Telas de Conversa
- Abertura de Apps Externos
- API Amazon Alexa
- API Tapo
- Dependências do Projeto
- Memória e Insights
- Perfil e Conta
- API WiZ
- API eWeLink
- Manifest PWA
- Config Expo
- Módulo auxiliar 24
- Módulo auxiliar 25
- Módulo auxiliar 26
- Módulo auxiliar 27
- Módulo auxiliar 28
- Módulo auxiliar 29
- Módulo auxiliar 30
- Módulo auxiliar 31
- Módulo auxiliar 32
- Módulo auxiliar 33
- Módulo auxiliar 34
- Módulo auxiliar 35
- Módulo auxiliar 36
- Módulo auxiliar 37
- Módulo auxiliar 38
- Módulo auxiliar 39
- Módulo auxiliar 41
- Módulo auxiliar 42
- Módulo auxiliar 43
- Módulo auxiliar 44
- Módulo auxiliar 47
- Módulo auxiliar 48
- Módulo auxiliar 49
- Módulo auxiliar 50
- Módulo auxiliar 53
- Módulo auxiliar 54
- Módulo auxiliar 55
- Módulo auxiliar 56
- Módulo auxiliar 57
- Módulo auxiliar 58
- Módulo auxiliar 59
- Módulo auxiliar 60
- Módulo auxiliar 61
- Módulo auxiliar 62
- Módulo auxiliar 63
- Módulo auxiliar 64
- Módulo auxiliar 65
- Módulo auxiliar 66
- Módulo auxiliar 67
- Módulo auxiliar 68
- Módulo auxiliar 69
- Módulo auxiliar 70
- Módulo auxiliar 71
- Módulo auxiliar 72
- Módulo auxiliar 73
- Módulo auxiliar 74
- Módulo auxiliar 75
- Módulo auxiliar 76
- Módulo auxiliar 77
- Módulo auxiliar 78
- Módulo auxiliar 79
- Módulo auxiliar 80
- Módulo auxiliar 81
- Módulo auxiliar 82
- Módulo auxiliar 83
- Módulo auxiliar 84
- Módulo auxiliar 85
- Módulo auxiliar 86
- useVoice.web.ts
- Verificacoes que rodaram (11)
- textToSpeech.ts
- Dimensao: OTA-vs-native-rebuild boundary for the installed Android APK (channel "preview")
- app/_layout.tsx
- useSettingsStore
- ewelinkService.ts
- OrbCore.tsx
- tuyaService.ts
- xiaomiService.ts
- perfil.tsx
- DeviceToggle.tsx
- Dimensao: Tuya "Executando..." forever hang — end-to-end trace of voice/text device control on native
- anthropicProxy.native.ts
- updates
- Auditoria do Argos nativo — julho/2026
- wizLocalBridgeService.ts
- automations.tsx
- babel-preset-expo
- lottie-react-native
- react-native-mmkv
- react-native-vosk
- @supabase/supabase-js

## God Nodes (most connected - your core abstractions)
1. `Colors` - 38 edges
2. `useArgos()` - 33 edges
3. `useSettingsStore` - 26 edges
4. `useVoice()` - 24 edges
5. `useDeviceStore` - 23 edges
6. `expo-router` - 22 edges
7. `SettingsScreen()` - 21 edges
8. `IntegracoesScreen()` - 20 edges
9. `Dimensao: Adversarial audit of the proposed native voice redesign (expo-av metering VAD + react-native-background-actions foreground service + RN FormData multipart upload) — OTA feasibility on the existing 1.0.0 APK` - 19 edges
10. `expo` - 18 edges

## Surprising Connections (you probably didn't know these)
- `AutomationsScreen()` --calls--> `useArgos()`  [EXTRACTED]
  app/(tabs)/automations.tsx → hooks/useArgos.ts
- `HabitInsightProps` --references--> `Insight`  [EXTRACTED]
  components/memory/HabitInsight.tsx → types/memory.types.ts
- `MemoryCardProps` --references--> `Memory`  [EXTRACTED]
  components/memory/MemoryCard.tsx → types/memory.types.ts
- `CreateAutomationModal()` --calls--> `useArgos()`  [EXTRACTED]
  app/(modals)/create-automation.tsx → hooks/useArgos.ts
- `MemoryScreen()` --calls--> `useArgos()`  [EXTRACTED]
  app/(modals)/memory.tsx → hooks/useArgos.ts

## Import Cycles
- None detected.

## Communities (112 total, 40 thin omitted)

### Community 0 - "Integrações de Dispositivos"
Cohesion: 0.25
Nodes (14): IntegracoesScreen(), styles, pingBridge(), authHeaders(), controlWizDevice(), disconnectWiz(), fetchWizDevices(), loginWiz() (+6 more)

### Community 1 - "Captura de Voz e VAD"
Cohesion: 0.09
Nodes (46): ConversarScreen(), styles, styles, VoiceInput(), VoiceInputProps, useVoice(), isBackgroundWakeWordRunning(), isBackgroundWakeWordSuspended() (+38 more)

### Community 2 - "Bootstrap do App e Auth"
Cohesion: 0.14
Nodes (18): AuthGuard(), styles, birthdateToIso(), formatBirthdateInput(), LoginScreen(), styles, InteligenciaScreen(), useSupabaseSync() (+10 more)

### Community 3 - "Modais e UI Base"
Cohesion: 0.09
Nodes (18): styles, styles, styles, styles, ActionList(), styles, styles, SuggestionPillProps (+10 more)

### Community 4 - "Ajuda de Voz e TTS"
Cohesion: 0.14
Nodes (26): isIOSWeb(), styles, VoiceInstallHelp(), VoiceInstallHelpProps, UseVoiceOptions, VOICE_SPEED_OPTIONS, reloadVoices(), unlockSpeech() (+18 more)

### Community 5 - "API Home Assistant e Prompt"
Cohesion: 0.08
Nodes (46): anthropic, buildHaSystemPrompt(), CATEGORY_SYNONYMS, COLOR_MAP, COLOR_TEMP_MAP, DeviceAction, deviceCache, DeviceCacheEntry (+38 more)

### Community 6 - "Tela e Controles de Dispositivos"
Cohesion: 0.09
Nodes (24): BRIGHTNESS_STEPS, byCustomOrder(), CATEGORY_LABELS, COLOR_PRESETS, DeviceCard(), DevicesScreen(), FAN_SPEED_STEPS, stateNumber() (+16 more)

### Community 7 - "Orb e Bolhas de Chat"
Cohesion: 0.07
Nodes (29): MessageBubbleProps, styles, OrbRingsProps, styles, StatusBarProps, styles, AnthropicModelId, BRIGHT_HIGH (+21 more)

### Community 8 - "Agenda e Rotinas"
Cohesion: 0.12
Nodes (11): EwelinkCallbackScreen(), TuyaCallbackScreen(), CasaScreen(), DeviceCard(), styles, TABS, styles, TabsLayout() (+3 more)

### Community 9 - "API Xiaomi"
Cohesion: 0.11
Nodes (30): apiUrl(), CookieJar, fetchDeviceList(), fetchSpecInstances(), findRegionAndDevices(), generateEncParams(), generateEncSignature(), generateNonce() (+22 more)

### Community 10 - "API Tuya"
Cohesion: 0.13
Nodes (33): executeAction(), buildHeaders(), calcSign(), exchangeTuyaCode(), getProjectCredentials(), getTuyaOAuthUrl(), getUserFromAuthHeader(), getValidTuyaCredentials() (+25 more)

### Community 11 - "Automações"
Cohesion: 0.07
Nodes (37): RoutineDetailModal(), AgendaScreen(), DAYS_PT, MONTHS_PT, Reminder, styles, TABS, ActionListProps (+29 more)

### Community 12 - "Memória e Inteligência"
Cohesion: 0.12
Nodes (18): CATEGORY_COLORS, styles, TabKey, TABS, CATEGORY_COLORS, CATEGORY_LABELS, styles, SwipeCard() (+10 more)

### Community 13 - "Telas de Conversa"
Cohesion: 0.18
Nodes (14): CreateAutomationModal(), styles, CATEGORY_CONFIG, MemoryScreen(), styles, buildConfirmationInfo(), needsConfirmation(), useArgos() (+6 more)

### Community 14 - "Abertura de Apps Externos"
Cohesion: 0.14
Nodes (20): OpenAppBanner(), styles, targetFromPending(), APP_LINKS, AppLink, AppOpenTarget, isAndroidWeb(), isIOSWeb() (+12 more)

### Community 15 - "API Amazon Alexa"
Cohesion: 0.18
Nodes (21): cors(), handler(), ALEXA_BASE, AlexaAction, alexaBase(), alexaControlDevice(), AlexaDevice, alexaListDevices() (+13 more)

### Community 16 - "API Tapo"
Cohesion: 0.19
Nodes (21): DeviceInfoResult, getDeviceInfo(), getTapoToken(), getUserFromAuthHeader(), hashPassword(), hexToRgb(), hsvToHex(), LIGHT_TYPES (+13 more)

### Community 17 - "Dependências do Projeto"
Cohesion: 0.09
Nodes (22): dotenv, devDependencies, dotenv, @types/react, typescript, @vercel/node, main, name (+14 more)

### Community 18 - "Memória e Insights"
Cohesion: 0.14
Nodes (9): HomeScreenWeb(), styles, OrbStatus(), OrbStatusProps, STATUS_CONFIG, styles, HOME_SUGGESTIONS, ORB_GRADIENT (+1 more)

### Community 19 - "Perfil e Conta"
Cohesion: 0.20
Nodes (11): getAnthropicClient(), getApiErrorMessage(), getSpeechErrorMessage(), ANTHROPIC_MODELS, getAnthropicApiKey(), isAnthropicConfigured(), MODEL_IDS, resolveAnthropicModel() (+3 more)

### Community 20 - "API WiZ"
Cohesion: 0.23
Nodes (18): buildWizParams(), extractWizToken(), getUserFromAuthHeader(), getWizToken(), hexToRgb(), parseDevice(), supabaseAsUser(), tempNameToKelvin() (+10 more)

### Community 21 - "API eWeLink"
Cohesion: 0.25
Nodes (17): cors(), handler(), ALL_REGIONS, apiHost(), buildAuthorizeUrl(), EwelinkAccountRow, ewelinkRequest(), exchangeCodeForTokens() (+9 more)

### Community 22 - "Manifest PWA"
Cohesion: 0.12
Nodes (16): background_color, categories, description, display, icons, id, lang, name (+8 more)

### Community 23 - "Config Expo"
Cohesion: 0.12
Nodes (16): typedRoutes, expo, backgroundColor, experiments, icon, name, orientation, plugins (+8 more)

### Community 24 - "Módulo auxiliar 24"
Cohesion: 0.17
Nodes (12): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, android, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE (+4 more)

### Community 25 - "Módulo auxiliar 25"
Cohesion: 0.17
Nodes (11): expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, nativewind-env.d.ts, **/*.ts, **/*.tsx, compilerOptions, paths (+3 more)

### Community 26 - "Módulo auxiliar 26"
Cohesion: 0.21
Nodes (11): BRIDGE_ID_FILE, { createClient }, crypto, dgram, discoverDevices(), fs, getLocalIp(), main() (+3 more)

### Community 27 - "Módulo auxiliar 27"
Cohesion: 0.18
Nodes (11): @anthropic-ai/sdk, date-fns, expo-linear-gradient, expo-updates, dependencies, @anthropic-ai/sdk, date-fns, expo-linear-gradient (+3 more)

### Community 28 - "Módulo auxiliar 28"
Cohesion: 0.33
Nodes (8): config, extFromMime(), handler(), isAuthed(), MultipartFile, parseMultipartFile(), readRawBody(), supabaseAdmin

### Community 29 - "Módulo auxiliar 29"
Cohesion: 0.22
Nodes (8): argos-blue.vercel.app, alias, buildCommand, framework, headers, installCommand, outputDirectory, rewrites

### Community 30 - "Módulo auxiliar 30"
Cohesion: 0.43
Nodes (7): fetchWeatherByCoords(), geocodeCity(), getBrowserLocation(), getWeather(), reverseGeocode(), weatherCodeToDescription(), WeatherResult

### Community 31 - "Módulo auxiliar 31"
Cohesion: 0.39
Nodes (5): collectVoicesOnce(), loadVoices(), reloadVoices(), unlockSpeech(), wait()

### Community 32 - "Módulo auxiliar 32"
Cohesion: 0.33
Nodes (6): web, backgroundColor, bundler, favicon, output, themeColor

### Community 33 - "Módulo auxiliar 33"
Cohesion: 0.33
Nodes (3): fs, path, { withAndroidManifest, withDangerousMod }

### Community 34 - "Módulo auxiliar 34"
Cohesion: 0.53
Nodes (5): isMicGranted(), PermState, queryPermissionsAPI(), requestMicPermission(), warmUpMic()

### Community 35 - "Módulo auxiliar 35"
Cohesion: 0.50
Nodes (4): anthropic, handler(), setCorsHeaders(), supabase

### Community 36 - "Módulo auxiliar 36"
Cohesion: 0.40
Nodes (5): projectId, extra, eas, router, skipAuth

### Community 37 - "Módulo auxiliar 37"
Cohesion: 0.40
Nodes (5): ios, NSMicrophoneUsageDescription, NSSpeechRecognitionUsageDescription, infoPlist, supportsTablet

### Community 41 - "Módulo auxiliar 41"
Cohesion: 0.50
Nodes (4): splash, backgroundColor, image, resizeMode

### Community 42 - "Módulo auxiliar 42"
Cohesion: 0.50
Nodes (3): config, { getDefaultConfig }, { withNativeWind }

### Community 43 - "Módulo auxiliar 43"
Cohesion: 0.50
Nodes (3): __dir, html, HTML_FILE

### Community 44 - "Módulo auxiliar 44"
Cohesion: 0.83
Nodes (3): getContext(), playListenChime(), tone()

### Community 48 - "Módulo auxiliar 48"
Cohesion: 0.12
Nodes (12): styles, ActionCardProps, styles, styles, HabitInsightProps, styles, MemoryCardProps, styles (+4 more)

### Community 54 - "Módulo auxiliar 54"
Cohesion: 0.11
Nodes (19): 22. HARD BLOCKER: the microphone foreground-service type is declared on a misspelled class name, so the real RNBA service has NO foregroundServiceType — startForeground() throws and crashes the app on Android 14+. Proposal item 3 is impossible via OTA., 23. Background wake word will stall whenever the screen is off: RN's setTimeout on Android is driven by android.view.Choreographer frame callbacks, which stop when the display stops producing vsync. No JS-only fix exists., 24. Proposal items 2 and 3 are mutually exclusive: expo-av permits exactly ONE Recording, enforced both by a JS module global and by a single native MediaRecorder field. A persistently-open 'volume gate' recorder makes active listening impossible., 25. The 'mirror the web AnalyserNode' premise is false on native: expo-av gives no parallel volume tap, so every gated capture needs a stop→prepare→start mic reopen, which systematically clips the wake word., 26. Permanent, unrecoverable deadlock: stopAndUnloadAsync does not guard `await ExponentAV.unloadAudioRecorder()`, so one rejection leaves _recorderExists === true and every future prepareToRecordAsync throws for the rest of the JS runtime's life., 27. status.metering on Android is NOT dBFS — expo-av uses natural log instead of log10, so values are 2.3026x too negative, the real range is about -208..0, and -160 is a non-monotonic sentinel. Any threshold ported from iOS docs or the web analyser will be wrong., 28. metering is a destructive peak-since-last-read, and expo-av consumes it on every native call — extra getStatusAsync() calls steal VAD samples, and the poll loop schedules its next tick before awaiting, so ticks overlap at 100 ms., 29. There is no native minimum for progressUpdateInterval — 100 ms is achievable in the foreground, but it is a pure JS setTimeout chain gated on the same Choreographer, so its real floor is ~1 frame plus one async round trip and it degrades silently under load or in the background. (+11 more)

### Community 62 - "Módulo auxiliar 62"
Cohesion: 0.18
Nodes (12): AmazonCallbackScreen(), styles, MOCK_DEVICES, RAW_MOCK_DEVICES, AlexaDeviceInfo, authHeaders(), controlAlexaDevice(), disconnectAmazon() (+4 more)

### Community 68 - "Módulo auxiliar 68"
Cohesion: 0.22
Nodes (11): accountStatusLabel(), optionPillStyle(), optionTextStyle(), SettingsScreen(), styles, authHeaders(), controlTapoDevice(), disconnectTapo() (+3 more)

### Community 84 - "Módulo auxiliar 84"
Cohesion: 0.22
Nodes (14): getAccessToken(), blobToBase64(), CaptureHandle, CaptureOptions, pickMimeType(), startCustomCapture(), transcribe(), blobToBase64() (+6 more)

### Community 89 - "useVoice.web.ts"
Cohesion: 0.25
Nodes (9): isCaptureSupported(), useVoice(), estimateDurationMs(), textToSpeech(), PauseFn, pauseVoiceInput(), registerVoicePause(), unregisterVoicePause() (+1 more)

### Community 90 - "Verificacoes que rodaram (11)"
Cohesion: 0.17
Nodes (12): V10 — MANTIDO, V11 — MANTIDO, V1 — MANTIDO, V2 — MANTIDO, V3 — MANTIDO, V4 — MANTIDO, V5 — MANTIDO, V6 — MANTIDO (+4 more)

### Community 91 - "textToSpeech.ts"
Cohesion: 0.26
Nodes (8): EMOJI_RE, resolveIntentSpeech(), stripEmojis(), stripForSpeech(), getVoices(), listAvailableVoices(), textToSpeech(), VoiceList

### Community 92 - "Dimensao: OTA-vs-native-rebuild boundary for the installed Android APK (channel "preview")"
Cohesion: 0.18
Nodes (11): 12. Background listening is rebuild-only: the microphone foregroundServiceType is declared on a class name that does not exist (typo), so startForeground() throws and kills the process, 13. There is no OTA-only path to background wake-word listening — removing the foregroundServiceType does not rescue it, 14. expo-file-system IS compiled into the installed APK (the audit premise is wrong) — it can be made usable through a JS-only OTA, 15. Auto-stop-after-silence (demand #2) is entirely OTA-safe — every native capability it needs is already linked, 16. The "whole screen goes black" symptom must be triaged as native process death before assuming it is OTA-fixable, 17. An OTA published to branch preview will reach the installed APK, but only while expo.version stays "1.0.0" and the policy stays appVersion, 18. The appVersion runtimeVersion policy gives zero protection against JS/native mismatch — an OTA that imports a missing native module ships happily and then crashes, 19. On-device Android speech recognition cannot be enabled by OTA: the manifest has no <queries> entry for android.speech.RecognitionService (+3 more)

### Community 93 - "app/_layout.tsx"
Cohesion: 0.29
Nodes (8): errorStyles, RootLayout(), rootStyle, updateStyles, useMicWarmUp(), useOAuthDeepLink(), useOAuthTabResume(), useSwUpdateReload()

### Community 94 - "useSettingsStore"
Cohesion: 0.27
Nodes (7): ChatScreen(), styles, enter, HomeScreen(), styles, useTheme(), useSettingsStore

### Community 95 - "ewelinkService.ts"
Cohesion: 0.31
Nodes (8): callChatApi(), authHeader(), controlEwelinkDevice(), EwelinkDevice, exchangeEwelinkCode(), fetchEwelinkDevices(), getEwelinkAuthorizeUrl(), loginEwelinkWithPassword()

### Community 96 - "OrbCore.tsx"
Cohesion: 0.25
Nodes (6): getGradientColors(), OrbAssembly(), OrbCore(), OrbCoreProps, orbShadowNative, styles

### Community 97 - "tuyaService.ts"
Cohesion: 0.39
Nodes (8): authHeaders(), controlTuyaDevice(), disconnectTuya(), exchangeTuyaCode(), fetchTuyaDevices(), getTuyaAuthorizeUrl(), loginTuya(), TuyaDeviceInfo

### Community 98 - "xiaomiService.ts"
Cohesion: 0.33
Nodes (7): authHeaders(), controlXiaomiDevice(), disconnectXiaomi(), fetchXiaomiDevices(), loginXiaomi(), XiaomiFanInfo, XiaomiVerificationRequiredError

### Community 99 - "perfil.tsx"
Cohesion: 0.36
Nodes (5): accountStatusLabel(), PerfilScreen(), pillStyle(), pillTextStyle(), styles

### Community 100 - "DeviceToggle.tsx"
Cohesion: 0.21
Nodes (4): DeviceToggleProps, styles, BottomSheetProps, styles

### Community 101 - "Dimensao: Tuya "Executando..." forever hang — end-to-end trace of voice/text device control on native"
Cohesion: 0.25
Nodes (8): 10. Native textToSpeech returns a promise that can never resolve (no onStopped, no timeout) — for the automation branch this strands status at 'executing', and it latches processingRef in every branch, 11. Same storage bug silently breaks Tuya hydration and sync reporting: `syncTuyaDevices` always returns count 0, devices reset to MOCK_DEVICES on every cold start, and sendMessage's `if (tuyaConnected)` guard is false on the first message, 5. ROOT CAUSE: useDeviceStore persists to a bogus `{}` storage on native — every toggleDevice/updateDeviceState throws TypeError, aborting the execution loop before the Tuya command is ever sent, 6. processIntent's device_control branch has a single happy-path exit: any throw strands status='executing' and the overlay permanently (fast-intent path and confirmPendingAction have no catch at all), 7. The `status === 'executing'` re-entrancy guard turns a transient stall into a permanent lock with no watchdog; processingRef can also latch forever, 8. Execution steps are marked 'success' on a 150ms timer without awaiting the Tuya call — the overlay reports success for commands that failed, and real Tuya errors are only console.error'd, 9. No fetch has a timeout/AbortController anywhere in the Tuya path, and React Native Android's OkHttp defaults to NO timeout — an awaited pre-flight sync can hang the flow forever, Dimensao: Tuya "Executando..." forever hang — end-to-end trace of voice/text device control on native

### Community 102 - "anthropicProxy.native.ts"
Cohesion: 0.29
Nodes (6): API_BASE, callChatApi(), createMessage(), MessageParam, MessageParams, MessageResponse

### Community 103 - "updates"
Cohesion: 0.29
Nodes (4): updates, ErrorBoundary, UpdateBanner(), url

### Community 104 - "Auditoria do Argos nativo — julho/2026"
Cohesion: 0.29
Nodes (6): 1. PRIMARY: useDeviceStore's zustand persist uses web-only localStorage with an `{} as Storage` fallback — on native EVERY set() throws a synchronous TypeError, which RN reports as a FATAL and the bridgeless host tears down the surface, leaving the dark window background, 2. There is no defense against event-handler/async throws: the sole ErrorBoundary only catches render errors, and expo-router adds no per-route boundary — so any uncaught handler throw will keep blanking the app, 3. Unguarded device.capabilities / device.state reads in both device cards — latent render crash that becomes REACHABLE on native the moment the persist fix lands and the devices array starts actually rehydrating, 4. RULED OUT: UpdateBanner / Updates.reloadAsync and Reanimated worklets are NOT causing the black screen, Auditoria do Argos nativo — julho/2026, Dimensao: Black screen when toggling a light (native APK)

### Community 105 - "wizLocalBridgeService.ts"
Cohesion: 0.33
Nodes (4): BroadcastMsg, scanWizLocal(), uid(), WizLocalDeviceInfo

### Community 106 - "automations.tsx"
Cohesion: 0.50
Nodes (4): AutomationCard(), automationCardStyle(), AutomationsScreen(), styles

## Knowledge Gaps
- **382 isolated node(s):** `ALEXA_BASE`, `TokenResponse`, `AlexaDevice`, `ApplianceEntry`, `BridgeEntry` (+377 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Módulo auxiliar 27` to `Tela e Controles de Dispositivos`, `Dependências do Projeto`, `Módulo auxiliar 55`, `Módulo auxiliar 56`, `Módulo auxiliar 57`, `Módulo auxiliar 58`, `Módulo auxiliar 59`, `Módulo auxiliar 60`, `Módulo auxiliar 61`, `Módulo auxiliar 63`, `Módulo auxiliar 64`, `Módulo auxiliar 65`, `Módulo auxiliar 66`, `Módulo auxiliar 67`, `Módulo auxiliar 69`, `Módulo auxiliar 70`, `Módulo auxiliar 71`, `Módulo auxiliar 72`, `Módulo auxiliar 73`, `Módulo auxiliar 74`, `Módulo auxiliar 75`, `Módulo auxiliar 76`, `Módulo auxiliar 77`, `Módulo auxiliar 78`, `Módulo auxiliar 79`, `Módulo auxiliar 80`, `Módulo auxiliar 81`, `Módulo auxiliar 82`, `Módulo auxiliar 83`, `Módulo auxiliar 85`, `babel-preset-expo`, `lottie-react-native`, `react-native-mmkv`, `react-native-vosk`, `@supabase/supabase-js`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `react` connect `Tela e Controles de Dispositivos` to `Integrações de Dispositivos`, `Módulo auxiliar 27`, `Módulo auxiliar 68`, `updates`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `expo-router` connect `Modais e UI Base` to `Integrações de Dispositivos`, `Bootstrap do App e Auth`, `perfil.tsx`, `Módulo auxiliar 68`, `Agenda e Rotinas`, `automations.tsx`, `Memória e Inteligência`, `Telas de Conversa`, `Memória e Insights`, `Config Expo`, `app/_layout.tsx`, `useSettingsStore`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **What connects `ALEXA_BASE`, `TokenResponse`, `AlexaDevice` to the rest of the system?**
  _382 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Captura de Voz e VAD` be split into smaller, more focused modules?**
  _Cohesion score 0.08754208754208755 - nodes in this community are weakly interconnected._
- **Should `Bootstrap do App e Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.13756613756613756 - nodes in this community are weakly interconnected._
- **Should `Modais e UI Base` be split into smaller, more focused modules?**
  _Cohesion score 0.09411764705882353 - nodes in this community are weakly interconnected._