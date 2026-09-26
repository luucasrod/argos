# V-001: Integrar LiveKit Wakeword em ArgosVoiceModule.kt

**Issue:** #257
**Branch:** claude/issue-257-livekit-wakeword
**Zona:** Claude (voice/native, `app/`, `components/`, `services/voice/`, plugins/)
**Dependência:** Nenhuma
**Bloqueador de:** #258 (V-002)
**Tempo estimado:** 2-3 dias
**Custo:** €0/mês (open-source)

---

## O que muda

### Estado atual
- `ArgosVoiceModule.kt` usa Vosk direto
- Wake word: `['ei', 'ola', 'ok', 'oi'] + argos` via gramática de Vosk
- Modelo PT em `assets/model-pt` (~45MB)
- Falso positivo alto, acurácia baixa em português

### Estado desejado
- `ArgosVoiceModule.kt` + **LiveKit Wakeword** (openWakeWord ONNX)
- Wake word customizável: 'argos', 'oi argos', 'ei argos'
- Modelo ONNX (~30MB, menor que Vosk)
- +30-40% acurácia, 100x menos falsos
- Vosk mantido como fallback (comanda rápida via gramática)

---

## Arquitetura

```
AudioRecord (16kHz, contínuo)
    ↓
ArgosVoiceModule.kt
    ├─→ LiveKit Wakeword (ONNX) — detecta "argos"
    │   └─→ if detected: emite onWakeWord event
    │
    └─→ Vosk (fallback) — comanda com gramática
        └─→ if matched: emite onCommand event
```

---

## Implementação — passos detalhados

### 1. Adicionar dependências Gradle

**Arquivo:** `plugins/withArgosVoiceModule.js`

Adicionar no `withArgosVoiceGradleDeps`:
```gradle
// ONNX Runtime (quantizado, ~15MB)
implementation 'com.microsoft.onnxruntime:onnxruntime-android:latest.release'

// LiveKit Wakeword (pode precisar compilar do source ou usar pre-built)
// Se não existir no Maven, usar o source: https://github.com/livekit/livekit-wakeword
// e compilar como AAR
```

**Alternativa se LiveKit não estiver no Maven:**
1. Clone https://github.com/livekit/livekit-wakeword
2. Compilar para Android AAR
3. Colocar em `libs/livekit-wakeword-android.aar`
4. No `build.gradle`: `implementation fileTree(dir: 'libs', include: ['*.aar'])`

### 2. Preparar modelo ONNX

**Arquivo:** `assets/openWakeWord/`

1. Download modelo português do openWakeWord
   - Opção A: Treinar custom em Colab (https://github.com/dscripka/openWakeWord/blob/main/training.ipynb)
   - Opção B: Usar modelo pré-treinado (se existir em português)
   - Recomendado: modelo em inglês "hey google" adaptado (Universal)

2. Salvar como ONNX no `assets/openWakeWord/model.onnx`

**Tamanho esperado:** 20-40MB (será empacotado no APK)

### 3. Modificar ArgosVoiceModule.kt

**Adicionar classe interna:**

```kotlin
private class LiveKitWakewordDetector {
    private val session: OrtSession
    
    fun loadModel(modelPath: String) {
        // Usar OrtSession pra rodar modelo ONNX
    }
    
    fun processFrame(audioFrame: FloatArray): Boolean {
        // Rodar inferência
        // Retornar true se detectou wake word
        return false
    }
}
```

**Modificar thread de leitura:**

```kotlin
// No recordThread loop:
if (running) {
    val result = audioRecord.read(audioBuffer, 0, CHUNK_SAMPLES, AudioRecord.READ_BLOCKING)
    if (result > 0) {
        // Alimentar Vosk de sempre
        recognizer?.acceptWaveForm(audioBuffer, result)
        
        // NOVO: Alimentar LiveKit em paralelo
        val isWakeWord = wakewordDetector.processFrame(audioBuffer)
        if (isWakeWord && !capturing) {
            capturing = true
            sendEvent("onWakeWord", "argos")
        }
    }
}
```

### 4. Expor métodos pra JavaScript

No `ArgosVoiceModule.kt`:

```kotlin
@ReactMethod
fun loadWakewordModel(path: String, promise: Promise) {
    try {
        wakewordDetector.loadModel(path)
        promise.resolve("ok")
    } catch (e: Exception) {
        promise.reject("WW_LOAD_ERROR", e.message, e)
    }
}

@ReactMethod
fun getWakewordLatency(): Double {
    // Retornar latência de processamento (debug)
    return 0.0
}
```

### 5. Integrar no TypeScript (services/voice/argosVoiceNative.ts)

```typescript
export async function initializeWakeword() {
  // Carregar modelo ONNX no nativo
  await argosVoice.loadWakewordModel('openWakeWord/model.onnx');
  
  // Escutar eventos
  deviceEventEmitter.addListener('onWakeWord', (result) => {
    console.log('Wake word detected:', result);
    // Emit global event pra app processar
  });
}
```

### 6. Testes

**Unit (Kotlin):**
- Mock OrtSession
- Testar processFrame com áudio conhecido (deve retornar true pra "argos")

**Integration:**
- Real audio no aparelho
- Medir FAR (False Acceptance Rate) — alvo <1% em ruído ambiente
- Medir FRR (False Rejection Rate) — alvo <5% com fala clara

**Performance:**
- Latência frame-a-frame (<50ms por CHUNK_SAMPLES)
- Bateria (CPU load vs Vosk)

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| ONNX Runtime não compila | Usar alternativa: TensorFlowLite runtime (menor, mainstream) |
| Modelo português não existe | Usar modelo em inglês + adaptar, ou treinar em Colab |
| Latência ONNX muito alta | Usar modelo quantizado (int8), não float32 |
| APK cresce demais | Model no servidor, download on-first-boot (mas difícil de validar) |

---

## Checklist

- [ ] Adicionar deps Gradle (ONNX Runtime)
- [ ] Download/preparar modelo ONNX
- [ ] Implementar LiveKitWakewordDetector em Kotlin
- [ ] Integrar no loop de AudioRecord
- [ ] Expor métodos pro JS
- [ ] Integrar em argosVoiceNative.ts
- [ ] Unit tests (Kotlin mock)
- [ ] Integration test (aparelho real)
- [ ] Medir FAR/FRR no aparelho
- [ ] Commit + Push branch
- [ ] PR (draft) contra experimento-grande

---

## Referências

- OpenWakeWord: https://github.com/dscripka/openWakeWord
- LiveKit Wakeword: https://github.com/livekit/livekit-wakeword
- ONNX Runtime Android: https://github.com/microsoft/onnxruntime/tree/main/java/src/main/java/ai/onnxruntime
- TensorFlow Lite (alternativa): https://www.tensorflow.org/lite

---

## Depois (V-002)

Adicionar Whisper.cpp pra comando livre em português (mesma estratégia: ONNX, on-device).
