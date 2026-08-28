# MAPA DO PROJETO ARGOS

## Estrutura Arquitetural

```
Argos = Voice Assistant + Smart Home Control

┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (RN/Expo)                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─ Casa (tabs)           → controle visual de dispositivos │
│  ├─ Dispositivos (tabs)   → listagem e gerenciamento        │
│  ├─ IA (tabs)            → chat + automações               │
│  ├─ Perfil (tabs)        → configurações do usuário        │
│  └─ Configurações (tabs) → integrações + privacidade       │
│                                                             │
│  Orb Component + ExecutionOverlay → feedback de voz/ações  │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│                  STATE & STORES (Zustand)                   │
├─────────────────────────────────────────────────────────────┤
│  useDeviceStore    → [Device] + sync (Tuya, Xiaomi, eWeLink)│
│  useAIStore        → status, steps, messages                │
│  useSettingsStore  → user prefs, integrations              │
│  useMemoryStore    → context para LLM                       │
│  useAutomationStore→ rules, automations                     │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│              VOICE & PROCESSING (services/)                 │
├─────────────────────────────────────────────────────────────┤
│  Voice Path:                 Control Path:                  │
│  ├─ textToSpeech.ts         ├─ tuyaService.ts             │
│  ├─ backgroundWakeWord.*    ├─ xiaomiService.ts           │
│  ├─ customCapture.web.ts    ├─ ewelinkService.ts          │
│  ├─ recordingService.ts     └─ localWizService.ts         │
│  └─ whisperClient.ts                                       │
│                                                             │
│  Intent Processing:                                        │
│  └─ fastIntent.ts (classificação local)                    │
│  └─ processIntent (useArgos)                               │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│              BACKEND API (api/ + Supabase)                  │
├─────────────────────────────────────────────────────────────┤
│  /api/tuya          → control/status Tuya devices          │
│  /api/xiaomi        → control Xiaomi devices               │
│  /api/ewelink       → control eWeLink devices              │
│  /api/ha            → local discovery (WiZ)                │
│  /api/whisper       → STT via OpenAI                       │
│  /api/claude        → LLM inference                        │
│  /api/auth          → session management                   │
│                                                             │
│  Supabase:                                                  │
│  ├─ auth_users      → identificação                        │
│  ├─ devices         → mirror local state                   │
│  ├─ automations     → rules storage                        │
│  └─ RLS policies    → data isolation                       │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│            EXTERNAL SERVICES (3rd party)                    │
├─────────────────────────────────────────────────────────────┤
│  Tuya Cloud API            → device control                │
│  Xiaomi Miio               → fan/humidifier control       │
│  eWeLink (Sonoff)          → socket control               │
│  OpenAI Whisper            → speech recognition            │
│  Anthropic Claude          → LLM for intent/chat          │
│  Local WiZ Discovery       → local lights                 │
└─────────────────────────────────────────────────────────────┘
```

## Maturidade por Módulo (2026-08-28)

| Área | Status | Notas |
|------|--------|-------|
| **UI/Casa** | DONE | Controle visual, toggle, modo claro/escuro |
| **Dispositivos** | IN_PROGRESS | Cards com capabilities, falta bind com todas integrações |
| **IA/Chat** | IN_PROGRESS | UI completa, intent processing, falta automações avançadas |
| **STT** | IN_PROGRESS | Whisper funcional, wake-word em construção (background) |
| **TTS** | DONE | Expo Speech integrado, mas sem timeout em native |
| **Tuya Integration** | IN_PROGRESS | Control funciona, sync com 10s interval, auth setup ok |
| **Xiaomi Integration** | PLANNED | Falta auth MQTT, usando HTTP direto (inseguro) |
| **eWeLink Integration** | DONE | Sonoff control via socket API |
| **WiZ Local** | DONE | GET /api/ha?action=wiz-devices endpoint |
| **Automations** | PLANNED | FastIntent existe, falta scheduler e UI rule builder |
| **Wake Word (Native)** | BLOCKED | Manifesto (typo + missing type), storage bug, timeout issues |
| **Auth & Security** | IN_PROGRESS | Supabase ok, falta secure storage para API keys |
| **Testes** | PLANNED | Nenhum teste automatizado documentado |

## Bloqueadores Críticos

```
🔴 CRÍTICO (bloqueia outros work):
  1. Zustand persist + localStorage em native → black screen (AUDIT #1)
  2. Foreground Service typo em manifest → wake-word crashes (AUDIT #12)
  3. Sem timeout em fetches Tuya/auth → status "Executando..." forever (AUDIT #9)

🟡 ALTO (impacta features):
  4. TTS promise never resolves → stalls status (AUDIT #10)
  5. No error propagation device control → silent failures (AUDIT #8)
  6. Config não versionada → APK não reproduzível (AUDIT #20)

🟢 MÉDIO (tech debt):
  7. Xiaomi HTTP sem auth → falta MQTT
  8. Automações sem scheduler nativo
  9. Wake-word sem VAD/silence-detection
```

## Fluxo de Dados Crítico: Voz → Controle de Dispositivo

```
User (fala) 
  ↓
expo-speech STT (ou Whisper)
  ↓
fastIntent (classificar intenção local)
  ↓
processIntent (useArgos.ts)
  └─ device_control branch:
      ├─ toggleDevice(deviceId) → updateDeviceStore
      ├─ controlTuyaDevice (POST /api/tuya)
      ├─ TTS speak("comando executado")
      └─ updateExecutionStep('success')
  ↓
Tuya API → dispositivo físico muda
  ↓
useDeviceStore.syncTuyaDevices() (10s interval)
  ↓
UI atualiza com novo estado
```

**Risco**: Sem error handling, qualquer throw aborta processIntent. Status fica em 'executing' forever.

---

**Última atualização**: 2026-08-28
**Responsável pela atualização**: Claude (setup inicial)
