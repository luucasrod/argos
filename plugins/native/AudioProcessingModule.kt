package com.masya.argos.modules

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.webrtc.audio.AudioProcessing

/**
 * AudioProcessingModule — controle de AEC (Acoustic Echo Cancellation) nativo.
 *
 * Usa a biblioteca WebRTC AudioProcessing para remover o eco do próprio TTS
 * que seria captado pelo microfone durante a escuta de barge-in.
 *
 * Injetado via config plugin (plugins/withArgosVoiceModule.js) — android/ é
 * gitignored e desaparece no próximo `expo prebuild`.
 */
class AudioProcessingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AudioProcessing"

  private var audioProcessing: AudioProcessing? = null
  private var echoCancellationEnabled = false
  private val TAG = "ArgosAudioProcessing"

  /**
   * Cria a instância do WebRTC AudioProcessing se ainda não existir.
   * O WebRTC AudioProcessing é thread-safe e pode ser criado uma vez.
   */
  private fun ensureAudioProcessing(): AudioProcessing {
    return audioProcessing ?: AudioProcessing.createBuiltinAudioProcessing().also {
      audioProcessing = it
    }
  }

  /**
   * Habilita ou desabilita o cancelamento de eco acústico (AEC).
   *
   * Deve ser chamado:
   * - `enableEchoCancellation(true)` em `beginTtsTurn()` (antes de começar a falar)
   * - `enableEchoCancellation(false)` em `endTtsTurn()` (após terminar de falar)
   *
   * O WebRTC AudioProcessing aplica AEC no nível do AudioRecord — o áudio
   * que chega ao recognizer (Vosk) já vem com o eco removido.
   */
  @ReactMethod
  fun enableEchoCancellation(enable: Boolean, promise: Promise) {
    try {
      val ap = ensureAudioProcessing()
      ap.setEchoCancellation(enable)
      // AGC e NS ajudam na qualidade geral durante a escuta ativa
      ap.setAutoGainControl(true)
      ap.setNoiseSuppression(true)

      echoCancellationEnabled = enable
      Log.d(TAG, "Echo cancellation ${if (enable) "enabled" else "disabled"}")
      promise.resolve("ok")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to set echo cancellation: ${e.message}")
      promise.reject("AEC_ERROR", e.message, e)
    }
  }

  /**
   * Verifica se o AEC está atualmente habilitado.
   */
  @ReactMethod
  fun isEchoCancellationEnabled(promise: Promise) {
    promise.resolve(echoCancellationEnabled)
  }

  /**
   * Libera recursos do AudioProcessing.
   * Chamado quando o módulo de voz é parado completamente.
   */
  @ReactMethod
  fun release(promise: Promise) {
    try {
      audioProcessing?.also { it.release() }
      audioProcessing = null
      echoCancellationEnabled = false
      Log.d(TAG, "AudioProcessing released")
      promise.resolve("ok")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to release AudioProcessing: ${e.message}")
      promise.reject("AEC_RELEASE_ERROR", e.message, e)
    }
  }

  // Necessários pro NativeEventEmitter do lado JS não reclamar de
  // "missing addListener/removeListeners" — módulo old-bridge
  // (ReactContextBaseJavaModule) não tem essas assinaturas como abstratas
  // pra usar `override` (diferente do NativeVoskSpec com codegen).
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}
}