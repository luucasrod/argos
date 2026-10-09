package com.masya.argos.modules

import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * WhisperCppSTT — STT on-device via whisper.cpp (V-002, issue #258).
 *
 * Usa JNI para chamar a biblioteca C++ whisper.cpp compilada como
 * libwhisper-jni.so. O modelo GGML (~31–57 MB quantizado) fica em
 * assets/whisper-pt/ggml-model.bin e é copiado para getFilesDir()
 * na primeira inicialização.
 *
 * Fallback silencioso: se a lib nativa não estiver disponível (build sem
 * CMake ou ABI não suportada), o módulo rejeita as promises com
 * NATIVE_UNAVAILABLE — quem chama volta para o caminho cloud.
 */
class WhisperCppSTT(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "WhisperCppSTT"
        private const val MODEL_ASSET_PATH = "whisper-pt/ggml-model.bin"
        private const val MODEL_DEST_DIR = "whisper_model"
        private const val MODEL_DEST_FILE = "ggml-model.bin"
        private const val SAMPLE_RATE = 16000
        private var nativeLoaded = false

        init {
            try {
                System.loadLibrary("whisper-jni")
                nativeLoaded = true
                Log.d(TAG, "libwhisper-jni carregada")
            } catch (e: UnsatisfiedLinkError) {
                Log.w(TAG, "libwhisper-jni não disponível (build sem CMake?): ${e.message}")
            }
        }
    }

    // Caminho do modelo copiado pra armazenamento gravável
    private var modelFilePath: String? = null

    override fun getName() = "WhisperCppSTT"

    // ------------------------------------------------------------------
    // JNI — implementadas em plugins/native/jni/WhisperJni.cpp
    // ------------------------------------------------------------------
    private external fun nativeInit(modelPath: String): Long
    private external fun nativeTranscribe(handle: Long, pcmFloat: FloatArray, language: String): String
    private external fun nativeFree(handle: Long)

    // ------------------------------------------------------------------
    // API React Native
    // ------------------------------------------------------------------

    /**
     * Carrega o modelo do asset para o armazenamento interno.
     * Deve ser chamado uma vez antes de transcribeAudioWhisper.
     */
    @ReactMethod
    fun loadModel(path: String, promise: Promise) {
        if (!nativeLoaded) {
            promise.reject("NATIVE_UNAVAILABLE", "libwhisper-jni não disponível")
            return
        }
        Thread {
            try {
                modelFilePath = copyModelAsset()
                Log.d(TAG, "Modelo pronto em $modelFilePath")
                promise.resolve("ok")
            } catch (e: Exception) {
                Log.e(TAG, "Falha ao carregar modelo", e)
                promise.reject("MODEL_LOAD_ERROR", e.message, e)
            }
        }.start()
    }

    /**
     * Transcreve áudio PCM16 16kHz mono (base64) via whisper.cpp.
     *
     * Retorna um map com { text, confidence, duration_ms, language }.
     * Cria e destrói o contexto Whisper por chamada para evitar consumo
     * permanente de memória (~150 MB do modelo em RAM).
     */
    @ReactMethod
    fun transcribeAudioWhisper(audioBase64: String, language: String, promise: Promise) {
        val mp = modelFilePath
        if (!nativeLoaded) {
            promise.reject("NATIVE_UNAVAILABLE", "libwhisper-jni não disponível")
            return
        }
        if (mp == null) {
            promise.reject("NOT_INITIALIZED", "Modelo não carregado — chame loadModel primeiro")
            return
        }
        Thread {
            try {
                val rawBytes = Base64.decode(audioBase64, Base64.DEFAULT)
                val pcmBytes = stripWavHeaderIfPresent(rawBytes)
                if (pcmBytes.size < 640) { // mínimo ~20ms a 16kHz
                    promise.resolve(emptyResult(language))
                    return@Thread
                }

                val floatPcm = pcm16ToFloat32(pcmBytes)

                val handle = nativeInit(mp)
                if (handle == 0L) {
                    promise.reject("INIT_FAILED", "Falha ao inicializar contexto Whisper — modelo corrompido?")
                    return@Thread
                }
                try {
                    val text = nativeTranscribe(handle, floatPcm, language)
                    val result = Arguments.createMap().apply {
                        putString("text", text.trim())
                        putDouble("confidence", 0.85)
                        putInt("duration_ms", pcmBytes.size / 2 * 1000 / SAMPLE_RATE)
                        putString("language", language)
                    }
                    promise.resolve(result)
                } finally {
                    nativeFree(handle)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro na transcrição", e)
                promise.reject("WHISPER_ERROR", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun getModelInfo(promise: Promise) {
        val result = Arguments.createMap().apply {
            putString("modelPath", modelFilePath ?: "não carregado")
            putBoolean("nativeAvailable", nativeLoaded)
            putBoolean("modelLoaded", modelFilePath != null)
            putInt("sampleRateHz", SAMPLE_RATE)
            putString("language", "pt")
        }
        promise.resolve(result)
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Copia o modelo do asset para getFilesDir() e devolve o caminho. */
    private fun copyModelAsset(): String {
        val destDir = File(reactContext.filesDir, MODEL_DEST_DIR)
        destDir.mkdirs()
        val destFile = File(destDir, MODEL_DEST_FILE)
        if (!destFile.exists()) {
            try {
                reactContext.assets.open(MODEL_ASSET_PATH).use { input ->
                    FileOutputStream(destFile).use { out -> input.copyTo(out) }
                }
                Log.d(TAG, "Modelo copiado: ${destFile.absolutePath}")
            } catch (e: IOException) {
                // Asset não empacotado: tenta usar caminho externo passado via path
                if (!destFile.exists()) throw e
            }
        }
        return destFile.absolutePath
    }

    /**
     * Detecta e remove cabeçalho WAV RIFF (44 bytes fixos) se presente.
     * O `ArgosVoiceModule.wrapPcmAsWav` usa o formato padrão PCM 16-bit,
     * então os primeiros 4 bytes são sempre b'RIFF'.
     */
    private fun stripWavHeaderIfPresent(bytes: ByteArray): ByteArray {
        if (bytes.size > 44 &&
            bytes[0] == 'R'.code.toByte() &&
            bytes[1] == 'I'.code.toByte() &&
            bytes[2] == 'F'.code.toByte() &&
            bytes[3] == 'F'.code.toByte()
        ) {
            return bytes.copyOfRange(44, bytes.size)
        }
        return bytes
    }

    /** Converte PCM-16 little-endian para Float32 normalizado [-1, 1]. */
    private fun pcm16ToFloat32(bytes: ByteArray): FloatArray {
        val samples = bytes.size / 2
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        return FloatArray(samples) { buf.short.toFloat() / 32768f }
    }

    private fun emptyResult(language: String) = Arguments.createMap().apply {
        putString("text", "")
        putDouble("confidence", 0.0)
        putInt("duration_ms", 0)
        putString("language", language)
    }
}
