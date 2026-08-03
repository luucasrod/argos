# Arquitetura Híbrida: React Native + Kotlin 🔥

> Guia completo de implementação da arquitetura híbrida Argos com operações críticas em Kotlin nativo.

## 🎯 Objetivo

**UI & Integrações Cloud** (React Native) ↔ **Operações Críticas & Background** (Kotlin)

```
┌─────────────────────────────────┐
│   React Native (UI + APIs)      │
│  - Settings, Device List        │
│  - Google Home, Xiaomi, Tapo    │
│  - Lógica de fluxo              │
└────────────┬────────────────────┘
             │ Bridge (Module)
┌────────────▼────────────────────┐
│   Kotlin Nativo (Crítico)       │
│  - Wake word detection 🎤       │
│  - Device control 🎮            │
│  - Background services ⚙️       │
│  - Microfone nativo 🔊          │
└─────────────────────────────────┘
```

## 📁 Estrutura de Pastas

```
android/app/src/main/java/com/argos/
├── ArgosNativePackage.kt           # Registro de módulos
├── modules/
│   ├── WakeWordDetector.kt        # 🎤 Detecção "Argos"
│   ├── DeviceControlModule.kt     # 🎮 Controle de dispositivos
│   ├── AudioProcessor.kt          # 🔊 Processamento de áudio
│   └── BackgroundService.kt       # ⚙️ Serviço persistente
└── bridge/
    ├── DeviceControlBridge.kt     # Bridge para React Native
    └── WakeWordBridge.kt          # Bridge para React Native
```

## 🔌 Módulos Implementados

### 1. **WakeWordDetector** (`modules/WakeWordDetector.kt`)

Detecta "Argos" em tempo real via microfone nativo.

**Interface React Native:**
```typescript
import { NativeModules } from 'react-native';
const { WakeWordDetector } = NativeModules;

await WakeWordDetector.startListening('argos');
await WakeWordDetector.stopListening();
const isActive = await WakeWordDetector.isListening();
```

**O que faz em Kotlin:**
- Inicializa `AudioRecord` nativo (16kHz PCM)
- Processa áudio em buffer contínuo
- Comparar com modelo TensorFlow Lite de wake word
- Callback via `sendEvent()` quando detectado
- Gerencia battery/wake locks

### 2. **DeviceControlModule** (`modules/DeviceControlModule.kt`)

Envia comandos críticos aos dispositivos rapidamente.

**Interface React Native:**
```typescript
import { NativeModules } from 'react-native';
const { DeviceControl } = NativeModules;

await DeviceControl.sendCommand('xiaomi:fan-123', 'toggle', { on: true });
await DeviceControl.startBackgroundService();
```

**O que faz em Kotlin:**
- Serializa comandos por tipo de dispositivo
- Retry logic com backoff exponencial
- Mantém conexões TCP abertas
- Wake locks para operações críticas
- Logging persistente

### 3. **AudioProcessor** (`modules/AudioProcessor.kt`)

Processamento de áudio de baixo nível.

**Responsabilidades:**
- Capturar PCM do microfone
- Aplicar noise cancellation
- Buffering e resampling
- Detecção de silêncio

### 4. **BackgroundService** (`modules/BackgroundService.kt`)

Serviço Android que roda sempre (mesmo com app fechado).

**Responsabilidades:**
- Manter detecção de wake word ativa
- Sincronizar estado de dispositivos
- Gerenciar conexões persistentes
- Notificações quando comando executado

---

## 🛠️ Implementação Passo a Passo

### **Fase 1: Setup Básico** ✅ (Já pronto)

- [x] Criar `ArgosNativePackage.kt`
- [x] Criar stubs de módulos
- [x] Estrutura de pastas

### **Fase 2: Wake Word Detection** (Próximo)

**2.1 - AudioRecord Nativo**
```kotlin
// Inicializar captura de áudio
val bufferSize = AudioRecord.getMinBufferSize(16000, CHANNEL_IN_MONO, ENCODING_PCM_16BIT)
val audioRecord = AudioRecord(
  MediaRecorder.AudioSource.MIC,
  16000,
  CHANNEL_IN_MONO,
  ENCODING_PCM_16BIT,
  bufferSize
)
audioRecord.startRecording()
```

**2.2 - TensorFlow Lite Model**
- Usar modelo pré-treinado de wake word (ex: Google's "OK Google")
- Ou treinar modelo específico para "Argos"
- Carregar `.tflite` dos `assets/`

**2.3 - Processing Loop**
- Buffer contínuo de 512 samples (32ms @ 16kHz)
- Passar para modelo TF Lite a cada frame
- Se confiança > 0.7, trigger callback

### **Fase 3: Device Control** (Paralelo)

**3.1 - Command Queue**
```kotlin
data class DeviceCommand(
  val deviceId: String,
  val type: String,      // "xiaomi", "tapo", etc
  val command: String,   // "toggle", "brightness"
  val params: Map<String, Any>
)

// Fila thread-safe
private val commandQueue = LinkedBlockingQueue<DeviceCommand>()
```

**3.2 - Executor Thread**
- Thread separada que processa fila
- Retry automático com backoff
- Logging de cada tentativa
- Callback ao React Native quando sucesso/falha

**3.3 - Background Service Integration**
- Manter executor rodando mesmo com app fechado
- Notification com status de dispositivos
- Sincronizar com React Native via bridge

---

## 🌉 Bridge React Native ↔ Kotlin

### **Padrão de Comunicação**

```typescript
// React Native → Kotlin
import { NativeModules, NativeEventEmitter } from 'react-native';

const { WakeWordDetector } = NativeModules;
const eventEmitter = new NativeEventEmitter(WakeWordDetector);

// Chamar método
await WakeWordDetector.startListening('argos');

// Escutar eventos
eventEmitter.addListener('wakeWordDetected', (data) => {
  console.log('Wake word detectado!', data);
  // Trigger ação no app (ex: abrir tela de comando)
});
```

### **Implementação em Kotlin**

```kotlin
import com.facebook.react.modules.core.DeviceEventManagerModule

class WakeWordDetector(private val reactContext: ReactApplicationContext) : ... {
  private fun emitEvent(eventName: String, params: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  // Quando wake word detectado:
  private fun onWakeWordDetected() {
    val params = WritableNativeMap().apply {
      putString("word", "argos")
      putDouble("confidence", 0.92)
      putLong("timestamp", System.currentTimeMillis())
    }
    emitEvent("wakeWordDetected", params)
  }
}
```

---

## 📋 Checklist de Implementação

### **Immediate (Esta semana)**
- [ ] Terminar `AudioProcessor.kt` com captura PCM
- [ ] Integrar TensorFlow Lite para wake word
- [ ] Testar `WakeWordDetector` sozinho
- [ ] Testar comunicação React Native ↔ Kotlin

### **Short-term (Próxima semana)**
- [ ] Implementar `DeviceControlModule` completo
- [ ] Queue + executor + retry logic
- [ ] Background service persistente
- [ ] Logging centralizado

### **Medium-term (2 semanas)**
- [ ] Otimizar bateria/performance
- [ ] Testes unitários Kotlin
- [ ] Testes de integração E2E
- [ ] Build APK final + testagem

---

## 🔑 Dependências Necessárias

Adicionar em `android/app/build.gradle`:

```gradle
dependencies {
  // TensorFlow Lite
  implementation 'org.tensorflow:tensorflow-lite:2.13.0'
  implementation 'org.tensorflow:tensorflow-lite-metadata:0.4.4'

  // Audio processing
  implementation 'com.tarsos.dsp:core:2.5'  // DSP library

  // WorkManager para background service
  implementation 'androidx.work:work-runtime-ktx:2.8.1'

  // React Native (já tem)
  implementation 'com.facebook.react:react-android'
}
```

---

## 🚀 Deploy Checklist

- [ ] Todos os testes passando
- [ ] APK gerado com sucesso
- [ ] Testado em device físico
- [ ] Wake word funciona
- [ ] Device control funciona
- [ ] Background service roda sem bugs
- [ ] Battery drain aceitável
- [ ] Release notes preparadas

---

## 📚 Referências

- [React Native Native Modules (Android)](https://reactnative.dev/docs/native-modules-android)
- [TensorFlow Lite Android Guide](https://www.tensorflow.org/lite/guide/android)
- [Android AudioRecord API](https://developer.android.com/reference/android/media/AudioRecord)
- [Android Background Execution Limits](https://developer.android.com/about/versions/12/behavior-changes-12#stop-misbehaving-apps)
- [WorkManager Guide](https://developer.android.com/topic/libraries/architecture/workmanager)

---

**Status:** 🟡 Em Implementação — Arquitetura pronta, faltam detalhes Kotlin
