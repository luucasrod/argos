package com.masya.argos.modules

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.concurrent.thread
import org.json.JSONArray
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.StorageService

/**
 * ArgosVoiceModule — dono único do `AudioRecord`, substitui o `SpeechService`
 * de `react-native-vosk` (issue #215).
 *
 * Por quê: `react-native-vosk` só entrega TEXTO reconhecido pro JS — nunca o
 * áudio bruto — porque o `SpeechService` da lib (org.vosk.android) é dono
 * privado do `AudioRecord`. Pra mandar o comando pro STT em nuvem (Deepgram,
 * ver #B-040 / api/stt.ts) preciso do áudio bruto, e não dá pra abrir um
 * segundo `AudioRecord` (Android nega mic novo em segundo plano — ver
 * docs/ai/CONTEXT.md, "já tentado e falhou" item 2).
 *
 * Este módulo chama a API pública de baixo nível do Vosk diretamente
 * (`Recognizer.acceptWaveForm()`), o mesmo que o `SpeechService` chama por
 * baixo — não é hack, é o uso documentado da lib pra quem precisa de mais
 * controle que o wrapper de alto nível dá. Loop de leitura roda numa thread
 * só, contínua, nunca para o `AudioRecord` — só troca o que é feito com cada
 * frame (sempre alimenta o recognizer; adicionalmente bufferiza em bytes
 * quando `armed`).
 *
 * Injetado via config plugin (plugins/withArgosVoiceModule.js) — `android/`
 * é gitignored e desaparece no próximo `expo prebuild`.
 */
private const val SAMPLE_RATE = 16000f
// ~200ms por leitura a 16kHz — mesma ordem de grandeza do SpeechService do
// vosk-android (BUFFER_SIZE_SECONDS), curto pro suficiente pra não atrasar
// a detecção de silêncio que já existe no lado JS.
private const val CHUNK_SAMPLES = 3200
// Faixa sugerida pelo documento de voz conversacional (issue #232): 1,5-2s.
// 1500ms escolhido como ponto médio inicial; validar no aparelho antes de
// tocar neste valor.
private const val PREROLL_MS = 1500

class ArgosVoiceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ArgosVoice"

  private var model: Model? = null
  @Volatile private var recognizer: Recognizer? = null
  private var audioRecord: AudioRecord? = null
  @Volatile private var running = false
  @Volatile private var capturing = false
  @Volatile private var recordThread: Thread? = null
  private val commandBuffer = ByteArrayOutputStream()
  private val bufferLock = Object()

  /**
   * Pre-roll: buffer circular fixo, SEMPRE alimentado (independente de
   * `capturing`), pra `armCommandCaptureWithPreRoll()` poder semear o
   * comando com o áudio de antes da wake word ser confirmada — sem isso,
   * "ei argos desliga a luz" dito rápido, sem pausa, perde o começo do
   * comando porque `armCommandCapture()` só passa a gravar DEPOIS que o
   * lado JS já confirmou a wake word (issue #235, achado da auditoria #233).
   * Memória fixa e pequena (1,5s a 16kHz mono PCM16 = 48.000 bytes) — custo
   * desprezível manter sempre ligado, mesmo quando não é usado.
   */
  private val preRollBytes = (SAMPLE_RATE.toInt() * PREROLL_MS / 1000) * 2
  private val preRollBuffer = ByteArray(preRollBytes)
  private var preRollWritePos = 0
  private var preRollFilled = false
  private val preRollLock = Object()

  private fun writePreRoll(bytes: ByteArray) {
    synchronized(preRollLock) {
      for (b in bytes) {
        preRollBuffer[preRollWritePos] = b
        preRollWritePos = (preRollWritePos + 1) % preRollBytes
        if (preRollWritePos == 0) preRollFilled = true
      }
    }
  }

  /** Conteúdo do pre-roll em ordem cronológica (mais antigo primeiro). */
  private fun readPreRoll(): ByteArray {
    synchronized(preRollLock) {
      if (!preRollFilled) {
        return preRollBuffer.copyOfRange(0, preRollWritePos)
      }
      val out = ByteArray(preRollBytes)
      System.arraycopy(preRollBuffer, preRollWritePos, out, 0, preRollBytes - preRollWritePos)
      System.arraycopy(preRollBuffer, 0, out, preRollBytes - preRollWritePos, preRollWritePos)
      return out
    }
  }

  private fun sendEvent(name: String, data: String?) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, data)
  }

  @ReactMethod
  fun loadModel(path: String, promise: Promise) {
    if (model != null) {
      promise.resolve("ja carregado")
      return
    }
    try {
      model = Model(path)
      promise.resolve("ok")
    } catch (e: IOException) {
      // Caminho não é absoluto: procura como asset empacotado (mesma
      // convenção do VoskModule.kt original — StorageService.unpack copia o
      // asset pra um diretório gravável e devolve o Model já aberto de lá).
      StorageService.unpack(
        reactContext,
        path,
        "models",
        { m: Model? -> model = m; promise.resolve("ok") },
        { e2: IOException -> promise.reject("MODEL_ERROR", e2.message, e2) }
      )
    }
  }

  /**
   * Gramática no formato que `Recognizer` espera: `["palavra1", "palavra2", ...]`.
   * `JSONArray` de verdade, não concatenação de string — a gramática inclui
   * `extraPhrases` com nomes reais de dispositivo/cômodo (ver
   * `services/voice/voskWakeWord.native.ts`), e um nome com `"` ou `\` dentro
   * quebrava o JSON manual e derrubava `start()` (achado na revisão cruzada
   * do PR #224).
   */
  private fun grammarToJson(arr: ReadableArray): String {
    val json = JSONArray()
    for (i in 0 until arr.size()) {
      json.put(arr.getString(i))
    }
    return json.toString()
  }

  @ReactMethod
  fun start(options: ReadableMap?, promise: Promise) {
    if (running) {
      promise.reject("ALREADY_RUNNING", "recognizer ja em execucao")
      return
    }
    val m = model
    if (m == null) {
      promise.reject("NO_MODEL", "modelo nao carregado")
      return
    }
    try {
      val grammarArray = options?.getArray("grammar")
      recognizer = if (grammarArray != null) {
        Recognizer(m, SAMPLE_RATE, grammarToJson(grammarArray))
      } else {
        Recognizer(m, SAMPLE_RATE)
      }

      val minBuf = AudioRecord.getMinBufferSize(
        SAMPLE_RATE.toInt(),
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      val bufBytes = maxOf(minBuf, CHUNK_SAMPLES * 2 * 4)
      val rec = AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        SAMPLE_RATE.toInt(),
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufBytes
      )
      if (rec.state != AudioRecord.STATE_INITIALIZED) {
        rec.release()
        recognizer?.close()
        recognizer = null
        promise.reject("AUDIO_INIT_ERROR", "AudioRecord nao inicializou (mic ocupado?)")
        return
      }

      audioRecord = rec
      rec.startRecording()
      running = true
      recordThread = thread(name = "ArgosVoiceLoop") { recordLoop() }
      promise.resolve("ok")
    } catch (e: Exception) {
      cleanup()
      promise.reject("START_ERROR", e.message, e)
    }
  }

  private fun recordLoop() {
    val shortBuf = ShortArray(CHUNK_SAMPLES)
    while (running) {
      val rec = audioRecord ?: break
      val read = rec.read(shortBuf, 0, shortBuf.size)
      if (read <= 0) continue

      val bytes = ByteArray(read * 2)
      for (i in 0 until read) {
        val s = shortBuf[i].toInt()
        bytes[i * 2] = (s and 0xFF).toByte()
        bytes[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
      }
      writePreRoll(bytes)
      if (capturing) {
        synchronized(bufferLock) { commandBuffer.write(bytes) }
      }

      val r = recognizer ?: continue
      try {
        val isFinal = r.acceptWaveForm(shortBuf, read)
        val json = if (isFinal) r.result else r.partialResult
        sendEvent(if (isFinal) "onResult" else "onPartialResult", json)
      } catch (e: Exception) {
        sendEvent("onError", e.message ?: "erro no recognizer")
      }
    }
  }

  /** Chamado quando a wake word é confirmada — começa a guardar o áudio bruto. */
  @ReactMethod
  fun armCommandCapture() {
    synchronized(bufferLock) { commandBuffer.reset() }
    capturing = true
  }

  /**
   * Como `armCommandCapture()`, mas semeia o `commandBuffer` com o pre-roll
   * (últimos ~1,5s de áudio) antes de começar a capturar ao vivo — evita
   * perder a primeira palavra do comando quando ele vem colado na wake word.
   * Método novo e separado de propósito: `armCommandCapture()` sem pre-roll
   * continua existindo e sendo o padrão; só o lado JS decide chamar este
   * (gated por `isVoiceSessionV2Enabled`, ver `voskWakeWord.native.ts`).
   */
  @ReactMethod
  fun armCommandCaptureWithPreRoll() {
    val preRoll = readPreRoll()
    synchronized(bufferLock) {
      commandBuffer.reset()
      commandBuffer.write(preRoll)
    }
    capturing = true
  }

  /**
   * Encerra a captura sem devolver nada — usada quando a fala é descartada
   * (cancelamento, erro) e ninguém vai chamar `getCommandAudioBase64`. Sem
   * isto, `capturing` ficaria travado em `true` e o buffer cresceria sem
   * limite nas próximas falas.
   */
  @ReactMethod
  fun cancelCommandCapture() {
    capturing = false
    synchronized(bufferLock) { commandBuffer.reset() }
  }

  /**
   * Encerra a captura do comando e devolve um arquivo WAV (PCM16 mono 16kHz,
   * com cabeçalho RIFF) em base64 — `api/transcribe.ts` (Whisper) já aceita
   * `{ audio: base64, mimeType }` nesse formato, é o mesmo endpoint que o
   * fluxo de toque-no-orb usa (`services/voice/customCapture.web.ts`). Sem
   * cabeçalho WAV o Whisper rejeita o arquivo — PCM cru não é um container
   * reconhecível, só o mimeType não basta.
   */
  @ReactMethod
  fun getCommandAudioBase64(promise: Promise) {
    capturing = false
    val pcm = synchronized(bufferLock) {
      val b = commandBuffer.toByteArray()
      commandBuffer.reset()
      b
    }
    promise.resolve(Base64.encodeToString(wrapPcmAsWav(pcm), Base64.NO_WRAP))
  }

  /** Cabeçalho RIFF/WAV de 44 bytes na frente do PCM16 mono 16kHz recebido. */
  private fun wrapPcmAsWav(pcm: ByteArray): ByteArray {
    val sampleRate = SAMPLE_RATE.toInt()
    val channels = 1
    val bitsPerSample = 16
    val byteRate = sampleRate * channels * bitsPerSample / 8
    val blockAlign = channels * bitsPerSample / 8
    val header = java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray())
    header.putInt(36 + pcm.size)
    header.put("WAVE".toByteArray())
    header.put("fmt ".toByteArray())
    header.putInt(16) // tamanho do sub-chunk fmt
    header.putShort(1) // PCM linear
    header.putShort(channels.toShort())
    header.putInt(sampleRate)
    header.putInt(byteRate)
    header.putShort(blockAlign.toShort())
    header.putShort(bitsPerSample.toShort())
    header.put("data".toByteArray())
    header.putInt(pcm.size)
    return header.array() + pcm
  }

  @ReactMethod
  fun stop() {
    cleanup()
  }

  /**
   * Ordem importa aqui — resolve race condition apontada na revisão cruzada
   * do PR #224: antes, `cleanup()` fechava `recognizer`/`audioRecord` sem
   * esperar a thread do `recordLoop()` sair de fato do `while (running)`. Ela
   * podia estar dentro de `acceptWaveForm()` com uma referência LOCAL (`val r`)
   * pro recognizer antigo — chamar método nativo num `Recognizer` já fechado
   * é undefined behavior no JNI do Vosk (crash), não uma exceção Kotlin que
   * o `try/catch` do loop pegaria. Start/stop rápido também deixava a thread
   * antiga viva o suficiente pra usar a instância nova.
   *
   * 1. `audioRecord.stop()` primeiro — desbloqueia um `read()` pendente na
   *    thread do loop (padrão documentado do Android: parar a gravação faz
   *    `read()` retornar, não trava esperando dado que nunca vem).
   * 2. Só DEPOIS espera a thread terminar (`join`) — agora ela sai rápido,
   *    porque o `read()` que a prendia já retornou e `running` é `false`.
   * 3. Com a thread garantidamente morta, libera `audioRecord`/`recognizer`.
   *    Nenhuma outra thread pode estar usando os dois nesse ponto.
   */
  private fun cleanup() {
    running = false
    capturing = false
    try {
      audioRecord?.stop()
    } catch (e: Exception) {
      // já parado, ou nunca chegou a iniciar — sem problema.
    }
    val thread = recordThread
    recordThread = null
    if (thread != null && thread !== Thread.currentThread()) {
      try {
        thread.join(1000)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
    audioRecord?.release()
    audioRecord = null
    recognizer?.close()
    recognizer = null
    synchronized(bufferLock) { commandBuffer.reset() }
    synchronized(preRollLock) {
      preRollWritePos = 0
      preRollFilled = false
    }
  }

  // Necessários pro NativeEventEmitter do lado JS (argosVoiceNative.ts) não
  // reclamar de "missing addListener/removeListeners" — módulo old-bridge
  // (ReactContextBaseJavaModule) não tem essas assinaturas como abstratas
  // pra usar `override` (diferente do NativeVoskSpec com codegen que o
  // VoskModule.kt original usa).
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}
}
