# Módulos Nativos Kotlin para Argos

## Visão Geral

Arquitetura **híbrida React Native + Kotlin** para operações críticas de:
- Detecção de wake word
- Controle de dispositivos
- Serviços em background
- Gerenciamento de áudio/microfone

## Estrutura

```
android/app/src/main/java/com/argos/modules/
├── WakeWordDetector.kt        # Detecção "Argos" via microfone nativo
├── DeviceControlModule.kt     # Envio crítico de comandos
└── ArgosNativePackage.kt      # Registro dos módulos
```

## Módulos Implementados

### 1. WakeWordDetector

**Responsabilidade:** Detectar palavra-chave "Argos" em tempo real

**Interface React Native:**
```typescript
import { NativeModules } from 'react-native';
const { WakeWordDetector } = NativeModules;

// Iniciar escuta
await WakeWordDetector.startListening('argos');

// Parar escuta
await WakeWordDetector.stopListening();

// Status
const isListening = await WakeWordDetector.isListening();
```

**Capabilidades (Kotlin nativo):**
- Acesso direto ao microfone do Android via `AudioRecord`
- Processamento de áudio em tempo real (16kHz PCM)
- Funciona sem UI aberta (background)
- Otimizado para bateria

**Por implementar:**
- Modelo de ML para reconhecimento de "Argos"
- Configuração de sensibilidade
- Callback quando palavra-chave detectada
- Logging de tentativas

---

### 2. DeviceControlModule

**Responsabilidade:** Enviar comandos críticos aos dispositivos

**Interface React Native:**
```typescript
import { NativeModules } from 'react-native';
const { DeviceControl } = NativeModules;

// Enviar comando
await DeviceControl.sendCommand(
  'xiaomi:fan-123',
  'toggle',
  { on: true }
);

// Iniciar serviço de background
await DeviceControl.startBackgroundService();
```

**Comandos suportados:**
- `toggle` - Ligar/desligar
- `brightness` - Ajustar brilho (0-100)
- `colorTemp` - Temperatura de cor
- `thermostat` - Temperatura/modo

**Por implementar:**
- Serialização de comandos por tipo de dispositivo
- Retry logic com backoff exponencial
- Gerenciamento de conexões persistentes
- Wake locks para operações críticas
- Logging de tentativas e erros

---

## Como Conectar React Native ↔ Kotlin

### 1. Registrar módulo no Package

Criar `android/app/src/main/java/com/argos/ArgosNativePackage.kt`:

```kotlin
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager

class ArgosNativePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(
      WakeWordDetector(reactContext),
      DeviceControlModule(reactContext)
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
```

### 2. Registrar no MainApplication.kt

```kotlin
protected fun getPackages(): List<ReactPackage> {
  return listOf(
    MainReactPackage(),
    ArgosNativePackage()  // ← Adicionar aqui
  )
}
```

### 3. Usar do JavaScript/TypeScript

```typescript
// services/voice/wakeWordDetection.native.ts
import { NativeModules } from 'react-native';

const { WakeWordDetector } = NativeModules;

export async function startWakeWordDetection() {
  try {
    await WakeWordDetector.startListening('argos');
    console.log('Wake word detection ativo');
  } catch (error) {
    console.error('Falha ao iniciar wake word:', error);
  }
}
```

---

## Timeline de Implementação

### Fase 1: Setup (próximo sprint)
- [ ] Criar estrutura de pastas Kotlin
- [ ] Registrar módulos nativos
- [ ] Criar bridge básico React Native ↔ Kotlin

### Fase 2: Wake Word (2-3 sprints)
- [ ] Implementar `AudioRecord` nativo
- [ ] Integrar modelo de ML (ex: TensorFlow Lite)
- [ ] Testar detecção em background
- [ ] Otimizar para bateria

### Fase 3: Device Control (paralelo)
- [ ] Implementar envio de comandos críticos
- [ ] Retry logic e gerenciamento de conexões
- [ ] Wake locks para operações importantes
- [ ] Background service persistente

---

## Referências

- [React Native Native Modules](https://reactnative.dev/docs/native-modules-android)
- [Android AudioRecord API](https://developer.android.com/reference/android/media/AudioRecord)
- [TensorFlow Lite Android](https://www.tensorflow.org/lite/android)
- [Android Background Services](https://developer.android.com/guide/components/services)

---

## Status

🔄 **Em Preparação** — Estrutura criada, aguardando implementação
