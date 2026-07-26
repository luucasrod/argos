# Graph Report - argos  (2026-07-23)

## Corpus Check
- 161 files · ~78,518 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1044 nodes · 2291 edges · 103 communities (70 shown, 33 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `966bca01`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- settings.tsx
- voicePicker.ts
- automation.types.ts
- _lib/xiaomi.ts
- _lib/tuya.ts
- casa.tsx
- ha.ts
- inteligencia.tsx
- perfil.tsx
- useArgos.ts
- browserActions.ts
- _lib/amazon.ts
- _lib/tapo.ts
- index.web.tsx
- useHaptic
- _lib/wiz.ts
- Colors
- _lib/ewelink.ts
- dependencies
- colors.ts
- anthropicProxy.ts
- useAuthStore.ts
- manifest.json
- expo
- index.tsx
- ai.types.ts
- useVoice.ts
- useVoice.web.ts
- GlassCard.tsx
- scripts
- fastIntent.ts
- include
- wiz-bridge.js
- agenda.tsx
- permissions
- app/_layout.tsx
- devDependencies
- DeviceToggle.tsx
- weatherService.ts
- speechUnlock.web.ts
- wakeWordDetector.web.ts
- customCapture.web.ts
- vercel.json
- web
- HabitInsight.tsx
- withForegroundService.js
- micPermission.web.ts
- chat.ts
- transcribe.ts
- extra
- ios
- anthropic.native.ts
- migrations.ts
- splash
- metro.config.js
- inject-pwa.mjs
- tone
- app.json
- plugins
- useVoiceStore.ts
- babel-preset-expo
- animations.ts
- expo
- expo-build-properties
- expo-constants
- expo-font
- expo-haptics
- useSettingsStore.ts
- expo-router
- expo-speech
- expo-system-ui
- expo-updates
- lottie-react-native
- nativewind
- react-dom
- @react-native-async-storage/async-storage
- react-native-background-actions
- react-native-gesture-handler
- react-native-linear-gradient
- react-native-mmkv
- react-native-reanimated
- react-native-screens
- react-native-svg
- @react-native-voice/voice
- react-native-web
- react-native-worklets
- @supabase/supabase-js
- tailwindcss
- sw.js
- expo-blur
- integracoes.tsx
- ai/config.ts
- useMemoryStore.ts
- getAccessToken
- tuyaService.ts
- xiaomiService.ts

## God Nodes (most connected - your core abstractions)
1. `Colors` - 52 edges
2. `useArgos()` - 46 edges
3. `SettingsScreen()` - 32 edges
4. `useHaptic()` - 29 edges
5. `useSettingsStore` - 26 edges
6. `getAccessToken()` - 23 edges
7. `useAIStore` - 23 edges
8. `useDeviceStore` - 23 edges
9. `expo-router` - 22 edges
10. `GlassCard()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `PerfilScreen()` --indirect_call--> `tone()`  [INFERRED]
  app/(tabs)/perfil.tsx → services/voice/listenChime.web.ts
- `SettingsScreen()` --indirect_call--> `tone()`  [INFERRED]
  app/(tabs)/settings.tsx → services/voice/listenChime.web.ts
- `EwelinkCallbackScreen()` --calls--> `useDeviceStore`  [EXTRACTED]
  app/integrations/ewelink/callback.tsx → stores/useDeviceStore.ts
- `DeviceStore` --references--> `Device`  [EXTRACTED]
  stores/useDeviceStore.ts → types/device.types.ts
- `AuthGuard()` --calls--> `useAuthStore`  [EXTRACTED]
  app/_layout.tsx → stores/useAuthStore.ts

## Import Cycles
- 3-file cycle: `services/ai/config.ts -> stores/useSettingsStore.ts -> types/settings.types.ts -> services/ai/config.ts`

## Communities (103 total, 33 thin omitted)

### Community 0 - "settings.tsx"
Cohesion: 0.22
Nodes (13): IntegracoesScreen(), accountStatusLabel(), optionPillStyle(), optionTextStyle(), SettingsScreen(), styles, react, react (+5 more)

### Community 1 - "voicePicker.ts"
Cohesion: 0.13
Nodes (30): EMOJI_RE, resolveIntentSpeech(), stripEmojis(), stripForSpeech(), loadVoices(), startSpeechKeepAlive(), getVoices(), listAvailableVoices() (+22 more)

### Community 2 - "automation.types.ts"
Cohesion: 0.08
Nodes (29): RoutineDetailModal(), AgendaScreen(), AutomationCard(), automationCardStyle(), AutomationsScreen(), styles, CasaScreen(), ActionListProps (+21 more)

### Community 3 - "_lib/xiaomi.ts"
Cohesion: 0.11
Nodes (30): apiUrl(), CookieJar, fetchDeviceList(), fetchSpecInstances(), findRegionAndDevices(), generateEncParams(), generateEncSignature(), generateNonce() (+22 more)

### Community 4 - "_lib/tuya.ts"
Cohesion: 0.13
Nodes (32): buildHeaders(), calcSign(), exchangeTuyaCode(), getProjectCredentials(), getTuyaOAuthUrl(), getUserFromAuthHeader(), getValidTuyaCredentials(), hexToTuyaHsv() (+24 more)

### Community 5 - "casa.tsx"
Cohesion: 0.10
Nodes (22): BRIGHTNESS_STEPS, byCustomOrder(), CATEGORY_LABELS, COLOR_PRESETS, DeviceCard(), DevicesScreen(), FAN_SPEED_STEPS, stateNumber() (+14 more)

### Community 6 - "ha.ts"
Cohesion: 0.11
Nodes (30): anthropic, buildHaSystemPrompt(), CATEGORY_SYNONYMS, DeviceAction, DIACRITICS_RE, ExecutionContext, extractPercentage(), findTargetDevices() (+22 more)

### Community 7 - "inteligencia.tsx"
Cohesion: 0.10
Nodes (18): CATEGORY_CONFIG, styles, CATEGORY_COLORS, styles, TabKey, TABS, MemoryCardProps, styles (+10 more)

### Community 8 - "perfil.tsx"
Cohesion: 0.18
Nodes (14): accountStatusLabel(), PerfilScreen(), pillStyle(), pillTextStyle(), styles, isIOSWeb(), styles, VoiceInstallHelp() (+6 more)

### Community 9 - "useArgos.ts"
Cohesion: 0.24
Nodes (11): CreateAutomationModal(), buildConfirmationInfo(), needsConfirmation(), useArgos(), withTimeout(), buildApiMessageHistory(), parseAIResponse(), ParsedIntent (+3 more)

### Community 10 - "browserActions.ts"
Cohesion: 0.15
Nodes (20): OpenAppBanner(), styles, targetFromPending(), APP_LINKS, AppLink, AppOpenTarget, getSupportedAppNames(), isAndroidWeb() (+12 more)

### Community 11 - "_lib/amazon.ts"
Cohesion: 0.18
Nodes (21): cors(), handler(), ALEXA_BASE, AlexaAction, alexaBase(), alexaControlDevice(), AlexaDevice, alexaListDevices() (+13 more)

### Community 12 - "_lib/tapo.ts"
Cohesion: 0.19
Nodes (21): DeviceInfoResult, getDeviceInfo(), getTapoToken(), getUserFromAuthHeader(), hashPassword(), hexToRgb(), hsvToHex(), LIGHT_TYPES (+13 more)

### Community 13 - "index.web.tsx"
Cohesion: 0.12
Nodes (16): styles, getGradientColors(), OrbAssembly(), OrbCore(), OrbCoreProps, orbShadowNative, styles, OrbRingsProps (+8 more)

### Community 14 - "useHaptic"
Cohesion: 0.19
Nodes (13): CapabilityControl(), RoomCard(), ChatScreen(), styles, ConversarScreen(), styles, MessageBubble(), PressableFeedback() (+5 more)

### Community 15 - "_lib/wiz.ts"
Cohesion: 0.22
Nodes (19): executeAction(), buildWizParams(), extractWizToken(), getUserFromAuthHeader(), getWizToken(), hexToRgb(), parseDevice(), supabaseAsUser() (+11 more)

### Community 16 - "Colors"
Cohesion: 0.10
Nodes (13): styles, styles, ActionList(), styles, styles, SuggestionPillProps, DeviceToggleProps, styles (+5 more)

### Community 17 - "_lib/ewelink.ts"
Cohesion: 0.24
Nodes (18): cors(), handler(), loadDevices(), ALL_REGIONS, apiHost(), buildAuthorizeUrl(), EwelinkAccountRow, ewelinkRequest() (+10 more)

### Community 18 - "dependencies"
Cohesion: 0.11
Nodes (19): @anthropic-ai/sdk, date-fns, expo-av, expo-linear-gradient, expo-linking, expo-status-bar, dependencies, @anthropic-ai/sdk (+11 more)

### Community 19 - "colors.ts"
Cohesion: 0.22
Nodes (7): styles, ExecutionOverlay(), styles, ExecutionStep(), ExecutionStepProps, ICONS, styles

### Community 20 - "anthropicProxy.ts"
Cohesion: 0.20
Nodes (14): callChatApi(), createMessage(), isConfigured(), MessageParams, MessageResponse, API_BASE, callChatApi(), createMessage() (+6 more)

### Community 21 - "useAuthStore.ts"
Cohesion: 0.19
Nodes (9): AuthGuard(), styles, birthdateToIso(), formatBirthdateInput(), LoginScreen(), styles, AuthStore, redirectToLogin() (+1 more)

### Community 22 - "manifest.json"
Cohesion: 0.12
Nodes (16): background_color, categories, description, display, icons, id, lang, name (+8 more)

### Community 23 - "expo"
Cohesion: 0.13
Nodes (15): typedRoutes, expo, backgroundColor, experiments, icon, name, orientation, runtimeVersion (+7 more)

### Community 24 - "index.tsx"
Cohesion: 0.27
Nodes (10): MemoryScreen(), enter, HomeScreen(), styles, HomeScreenWeb(), InteligenciaScreen(), useTheme(), handleInsightPress() (+2 more)

### Community 25 - "ai.types.ts"
Cohesion: 0.14
Nodes (10): ActionCardProps, styles, MessageBubbleProps, styles, styles, styles, AIStore, ConversationContext (+2 more)

### Community 26 - "useVoice.ts"
Cohesion: 0.27
Nodes (11): styles, VoiceInput(), VoiceInputProps, useVoice(), blobToBase64(), isBackgroundWakeWordRunning(), normalize(), startBackgroundWakeWord() (+3 more)

### Community 27 - "useVoice.web.ts"
Cohesion: 0.13
Nodes (21): isCaptureSupported(), useVoice(), blobToBase64(), CaptureHandle, CaptureOptions, pickMimeType(), startCustomCapture(), transcribe() (+13 more)

### Community 28 - "GlassCard.tsx"
Cohesion: 0.19
Nodes (9): styles, styles, HabitInsightProps, styles, GlassCard(), GlassCardProps, styles, MemoryStore (+1 more)

### Community 29 - "scripts"
Cohesion: 0.15
Nodes (12): main, name, private, scripts, android, build:web, dev, ios (+4 more)

### Community 30 - "fastIntent.ts"
Cohesion: 0.27
Nodes (12): BRIGHT_HIGH, BRIGHT_LOW, BRIGHT_MAX, BRIGHT_MIN, DIACRITICS_RE, extractPercentage(), matchBrightnessCommand(), matchFastDeviceCommand() (+4 more)

### Community 31 - "include"
Cohesion: 0.17
Nodes (11): expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, nativewind-env.d.ts, **/*.ts, **/*.tsx, compilerOptions, paths (+3 more)

### Community 32 - "wiz-bridge.js"
Cohesion: 0.21
Nodes (11): BRIDGE_ID_FILE, { createClient }, crypto, dgram, discoverDevices(), fs, getLocalIp(), main() (+3 more)

### Community 33 - "agenda.tsx"
Cohesion: 0.17
Nodes (11): DAYS_PT, MONTHS_PT, Reminder, styles, TABS, styles, TABS, styles (+3 more)

### Community 34 - "permissions"
Cohesion: 0.20
Nodes (10): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, android, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE (+2 more)

### Community 35 - "app/_layout.tsx"
Cohesion: 0.22
Nodes (6): AuthGuard(), ErrorBoundary, errorStyles, RootLayout(), rootStyle, useMicWarmUp()

### Community 36 - "devDependencies"
Cohesion: 0.22
Nodes (9): dotenv, devDependencies, dotenv, @types/react, typescript, @vercel/node, @types/react, typescript (+1 more)

### Community 37 - "DeviceToggle.tsx"
Cohesion: 0.17
Nodes (9): MOCK_DEVICES, RAW_MOCK_DEVICES, BroadcastMsg, controlWizLocal(), scanWizLocal(), uid(), WizLocalDeviceInfo, DeviceStore (+1 more)

### Community 38 - "weatherService.ts"
Cohesion: 0.43
Nodes (7): fetchWeatherByCoords(), geocodeCity(), getBrowserLocation(), getWeather(), reverseGeocode(), weatherCodeToDescription(), WeatherResult

### Community 39 - "speechUnlock.web.ts"
Cohesion: 0.39
Nodes (5): collectVoicesOnce(), loadVoices(), reloadVoices(), unlockSpeech(), wait()

### Community 40 - "wakeWordDetector.web.ts"
Cohesion: 0.23
Nodes (8): styles, TuyaCallbackScreen(), DeviceCard(), styles, TabsLayout(), TabsLayout(), useSupabaseSync(), useDeviceStore

### Community 41 - "customCapture.web.ts"
Cohesion: 0.31
Nodes (9): AmazonCallbackScreen(), styles, AlexaDeviceInfo, authHeaders(), controlAlexaDevice(), disconnectAmazon(), exchangeAmazonCode(), fetchAlexaDevices() (+1 more)

### Community 42 - "vercel.json"
Cohesion: 0.29
Nodes (6): buildCommand, framework, headers, installCommand, outputDirectory, rewrites

### Community 43 - "web"
Cohesion: 0.33
Nodes (6): web, backgroundColor, bundler, favicon, output, themeColor

### Community 44 - "HabitInsight.tsx"
Cohesion: 0.29
Nodes (9): EwelinkCallbackScreen(), styles, authHeader(), controlEwelinkDevice(), EwelinkDevice, exchangeEwelinkCode(), fetchEwelinkDevices(), getEwelinkAuthorizeUrl() (+1 more)

### Community 45 - "withForegroundService.js"
Cohesion: 0.33
Nodes (3): fs, path, { withAndroidManifest, withDangerousMod }

### Community 46 - "micPermission.web.ts"
Cohesion: 0.53
Nodes (5): isMicGranted(), PermState, queryPermissionsAPI(), requestMicPermission(), warmUpMic()

### Community 47 - "chat.ts"
Cohesion: 0.50
Nodes (4): anthropic, handler(), setCorsHeaders(), supabase

### Community 48 - "transcribe.ts"
Cohesion: 0.60
Nodes (4): extFromMime(), handler(), isAuthed(), supabaseAdmin

### Community 49 - "extra"
Cohesion: 0.40
Nodes (5): projectId, extra, eas, router, skipAuth

### Community 50 - "ios"
Cohesion: 0.40
Nodes (5): ios, NSMicrophoneUsageDescription, NSSpeechRecognitionUsageDescription, infoPlist, supportsTablet

### Community 54 - "splash"
Cohesion: 0.50
Nodes (4): splash, backgroundColor, image, resizeMode

### Community 55 - "metro.config.js"
Cohesion: 0.50
Nodes (3): config, { getDefaultConfig }, { withNativeWind }

### Community 56 - "inject-pwa.mjs"
Cohesion: 0.50
Nodes (3): __dir, html, HTML_FILE

### Community 57 - "tone"
Cohesion: 0.83
Nodes (3): getContext(), playListenChime(), tone()

### Community 61 - "plugins"
Cohesion: 0.67
Nodes (3): plugins, ./plugins/withForegroundService, @react-native-voice/voice

### Community 72 - "useSettingsStore.ts"
Cohesion: 0.38
Nodes (8): ANTHROPIC_MODELS, AnthropicModelId, defaultPersonality, defaultSettings, SettingsStore, AIPersonality, Settings, UserProfile

### Community 101 - "integracoes.tsx"
Cohesion: 0.33
Nodes (8): styles, authHeaders(), controlWizDevice(), disconnectWiz(), fetchWizDevices(), loginWiz(), loginWizWithGoogle(), WizDeviceInfo

### Community 102 - "ai/config.ts"
Cohesion: 0.31
Nodes (7): getAnthropicClient(), getApiErrorMessage(), getSpeechErrorMessage(), getAnthropicApiKey(), isAnthropicConfigured(), MODEL_IDS, resolveAnthropicModel()

### Community 103 - "useMemoryStore.ts"
Cohesion: 0.31
Nodes (4): supabase, SupabaseUser, normalizeInsight(), defaultMemories

### Community 104 - "getAccessToken"
Cohesion: 0.39
Nodes (7): getAccessToken(), authHeaders(), controlTapoDevice(), disconnectTapo(), fetchTapoDevices(), loginTapo(), TapoDeviceInfo

### Community 105 - "tuyaService.ts"
Cohesion: 0.39
Nodes (8): authHeaders(), controlTuyaDevice(), disconnectTuya(), exchangeTuyaCode(), fetchTuyaDevices(), getTuyaAuthorizeUrl(), loginTuya(), TuyaDeviceInfo

### Community 106 - "xiaomiService.ts"
Cohesion: 0.33
Nodes (7): authHeaders(), controlXiaomiDevice(), disconnectXiaomi(), fetchXiaomiDevices(), loginXiaomi(), XiaomiFanInfo, XiaomiVerificationRequiredError

## Knowledge Gaps
- **302 isolated node(s):** `styles`, `AuthStore`, `PRECACHE_URLS`, `ALEXA_BASE`, `TokenResponse` (+297 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `settings.tsx`, `scripts`, `babel-preset-expo`, `expo`, `expo-build-properties`, `expo-constants`, `expo-font`, `expo-haptics`, `expo-router`, `expo-speech`, `expo-system-ui`, `expo-updates`, `lottie-react-native`, `nativewind`, `react-dom`, `@react-native-async-storage/async-storage`, `react-native-background-actions`, `react-native-gesture-handler`, `react-native-linear-gradient`, `react-native-mmkv`, `react-native-reanimated`, `react-native-screens`, `react-native-svg`, `@react-native-voice/voice`, `react-native-web`, `react-native-worklets`, `@supabase/supabase-js`, `tailwindcss`, `expo-blur`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `react` connect `settings.tsx` to `dependencies`, `casa.tsx`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `SettingsScreen()` connect `settings.tsx` to `integracoes.tsx`, `getAccessToken`, `customCapture.web.ts`, `tuyaService.ts`, `xiaomiService.ts`, `HabitInsight.tsx`, `perfil.tsx`, `useHaptic`, `wakeWordDetector.web.ts`, `Colors`, `anthropicProxy.ts`, `useAuthStore.ts`, `index.tsx`, `tone`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **What connects `styles`, `AuthStore`, `PRECACHE_URLS` to the rest of the system?**
  _302 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `voicePicker.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12802275960170698 - nodes in this community are weakly interconnected._
- **Should `automation.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08478513356562137 - nodes in this community are weakly interconnected._
- **Should `_lib/xiaomi.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._