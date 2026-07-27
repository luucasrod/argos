# Graph Report - A:/Argos/argos  (2026-07-26)

## Corpus Check
- 174 files · ~107,506 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1098 nodes · 2434 edges · 89 communities (50 shown, 39 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `Colors` - 53 edges
2. `useArgos()` - 46 edges
3. `SettingsScreen()` - 32 edges
4. `useHaptic()` - 29 edges
5. `useSettingsStore` - 26 edges
6. `useVoice()` - 23 edges
7. `getAccessToken()` - 23 edges
8. `useAIStore` - 23 edges
9. `useDeviceStore` - 23 edges
10. `expo-router` - 22 edges

## Surprising Connections (you probably didn't know these)
- `CreateAutomationModal()` --calls--> `useArgos()`  [EXTRACTED]
  app/(modals)/create-automation.tsx → hooks/useArgos.ts
- `PerfilScreen()` --indirect_call--> `tone()`  [INFERRED]
  app/(tabs)/perfil.tsx → services/voice/listenChime.web.ts
- `SettingsScreen()` --indirect_call--> `tone()`  [INFERRED]
  app/(tabs)/settings.tsx → services/voice/listenChime.web.ts
- `IntegracoesScreen()` --calls--> `useHaptic()`  [EXTRACTED]
  app/(modals)/integracoes.tsx → hooks/useHaptic.ts
- `MemoryScreen()` --calls--> `useArgos()`  [EXTRACTED]
  app/(modals)/memory.tsx → hooks/useArgos.ts

## Import Cycles
- 3-file cycle: `services/ai/config.ts -> stores/useSettingsStore.ts -> types/settings.types.ts -> services/ai/config.ts`

## Communities (89 total, 39 thin omitted)

### Community 0 - "Integrações de Dispositivos"
Cohesion: 0.05
Nodes (76): AmazonCallbackScreen(), styles, EwelinkCallbackScreen(), styles, styles, TuyaCallbackScreen(), IntegracoesScreen(), styles (+68 more)

### Community 1 - "Captura de Voz e VAD"
Cohesion: 0.07
Nodes (50): styles, VoiceInput(), VoiceInputProps, UseVoiceOptions, VOICE_SPEED_OPTIONS, useVoice(), isCaptureSupported(), useVoice() (+42 more)

### Community 2 - "Bootstrap do App e Auth"
Cohesion: 0.07
Nodes (40): updates, AuthGuard(), ErrorBoundary, errorStyles, RootLayout(), rootStyle, UpdateBanner(), updateStyles (+32 more)

### Community 3 - "Modais e UI Base"
Cohesion: 0.07
Nodes (24): CreateAutomationModal(), styles, styles, styles, styles, styles, SuggestionPillProps, styles (+16 more)

### Community 4 - "Ajuda de Voz e TTS"
Cohesion: 0.10
Nodes (37): isIOSWeb(), styles, VoiceInstallHelp(), VoiceInstallHelpProps, EMOJI_RE, resolveIntentSpeech(), stripEmojis(), stripForSpeech() (+29 more)

### Community 5 - "API Home Assistant e Prompt"
Cohesion: 0.08
Nodes (46): anthropic, buildHaSystemPrompt(), CATEGORY_SYNONYMS, COLOR_MAP, COLOR_TEMP_MAP, DeviceAction, deviceCache, DeviceCacheEntry (+38 more)

### Community 6 - "Tela e Controles de Dispositivos"
Cohesion: 0.07
Nodes (36): BRIGHTNESS_STEPS, byCustomOrder(), CATEGORY_LABELS, COLOR_PRESETS, DeviceCard(), DevicesScreen(), FAN_SPEED_STEPS, stateNumber() (+28 more)

### Community 7 - "Orb e Bolhas de Chat"
Cohesion: 0.08
Nodes (26): ActionCardProps, MessageBubbleProps, styles, getGradientColors(), OrbAssembly(), OrbCoreProps, orbShadowNative, styles (+18 more)

### Community 8 - "Agenda e Rotinas"
Cohesion: 0.09
Nodes (29): RoutineDetailModal(), styles, AgendaScreen(), DAYS_PT, MONTHS_PT, Reminder, styles, TABS (+21 more)

### Community 9 - "API Xiaomi"
Cohesion: 0.11
Nodes (30): apiUrl(), CookieJar, fetchDeviceList(), fetchSpecInstances(), findRegionAndDevices(), generateEncParams(), generateEncSignature(), generateNonce() (+22 more)

### Community 10 - "API Tuya"
Cohesion: 0.13
Nodes (33): executeAction(), buildHeaders(), calcSign(), exchangeTuyaCode(), getProjectCredentials(), getTuyaOAuthUrl(), getUserFromAuthHeader(), getValidTuyaCredentials() (+25 more)

### Community 11 - "Automações"
Cohesion: 0.11
Nodes (21): ActionListProps, AutomationCard(), AutomationCardProps, PresetAutomationProps, styles, TriggerBadgeProps, PRESET_AUTOMATIONS, PRESET_ROUTINES (+13 more)

### Community 12 - "Memória e Inteligência"
Cohesion: 0.09
Nodes (20): CATEGORY_COLORS, styles, TabKey, TABS, HabitInsightProps, styles, MemoryCardProps, styles (+12 more)

### Community 13 - "Telas de Conversa"
Cohesion: 0.17
Nodes (19): ChatScreen(), styles, ConversarScreen(), styles, MessageBubble(), buildConfirmationInfo(), needsConfirmation(), useArgos() (+11 more)

### Community 14 - "Abertura de Apps Externos"
Cohesion: 0.15
Nodes (20): OpenAppBanner(), styles, targetFromPending(), APP_LINKS, AppLink, AppOpenTarget, getSupportedAppNames(), isAndroidWeb() (+12 more)

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
Cohesion: 0.19
Nodes (15): CATEGORY_CONFIG, MemoryScreen(), styles, enter, HomeScreen(), styles, HomeScreenWeb(), styles (+7 more)

### Community 19 - "Perfil e Conta"
Cohesion: 0.16
Nodes (15): InteligenciaScreen(), accountStatusLabel(), PerfilScreen(), pillStyle(), pillTextStyle(), styles, useTheme(), ANTHROPIC_MODELS (+7 more)

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
Cohesion: 0.15
Nodes (13): typedRoutes, expo, backgroundColor, experiments, icon, name, orientation, runtimeVersion (+5 more)

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
Nodes (11): @anthropic-ai/sdk, babel-preset-expo, lottie-react-native, dependencies, @anthropic-ai/sdk, babel-preset-expo, lottie-react-native, react-native-mmkv (+3 more)

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
Cohesion: 0.67
Nodes (3): plugins, ./plugins/withForegroundService, @react-native-voice/voice

## Knowledge Gaps
- **320 isolated node(s):** `ALEXA_BASE`, `TokenResponse`, `AlexaDevice`, `ApplianceEntry`, `BridgeEntry` (+315 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Módulo auxiliar 27` to `Integrações de Dispositivos`, `Dependências do Projeto`, `Módulo auxiliar 54`, `Módulo auxiliar 55`, `Módulo auxiliar 56`, `Módulo auxiliar 57`, `Módulo auxiliar 58`, `Módulo auxiliar 59`, `Módulo auxiliar 60`, `Módulo auxiliar 61`, `Módulo auxiliar 62`, `Módulo auxiliar 63`, `Módulo auxiliar 64`, `Módulo auxiliar 65`, `Módulo auxiliar 66`, `Módulo auxiliar 67`, `Módulo auxiliar 68`, `Módulo auxiliar 69`, `Módulo auxiliar 70`, `Módulo auxiliar 71`, `Módulo auxiliar 72`, `Módulo auxiliar 73`, `Módulo auxiliar 74`, `Módulo auxiliar 75`, `Módulo auxiliar 76`, `Módulo auxiliar 77`, `Módulo auxiliar 78`, `Módulo auxiliar 79`, `Módulo auxiliar 80`, `Módulo auxiliar 81`, `Módulo auxiliar 82`, `Módulo auxiliar 83`, `Módulo auxiliar 84`, `Módulo auxiliar 85`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `react` connect `Integrações de Dispositivos` to `Bootstrap do App e Auth`, `Módulo auxiliar 27`, `Tela e Controles de Dispositivos`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `Colors` connect `Modais e UI Base` to `Integrações de Dispositivos`, `Captura de Voz e VAD`, `Bootstrap do App e Auth`, `Ajuda de Voz e TTS`, `Tela e Controles de Dispositivos`, `Orb e Bolhas de Chat`, `Agenda e Rotinas`, `Automações`, `Memória e Inteligência`, `Telas de Conversa`, `Abertura de Apps Externos`, `Memória e Insights`, `Perfil e Conta`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `ALEXA_BASE`, `TokenResponse`, `AlexaDevice` to the rest of the system?**
  _320 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Integrações de Dispositivos` be split into smaller, more focused modules?**
  _Cohesion score 0.052094150224991344 - nodes in this community are weakly interconnected._
- **Should `Captura de Voz e VAD` be split into smaller, more focused modules?**
  _Cohesion score 0.07019230769230769 - nodes in this community are weakly interconnected._
- **Should `Bootstrap do App e Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.07039187227866474 - nodes in this community are weakly interconnected._