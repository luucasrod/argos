package com.masya.argos.modules

import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * AudioProcessingModule — controle de AEC via Android AudioFx nativo.
 *
 * Usa AcousticEchoCanceler, AutomaticGainControl e NoiseSuppressor do
 * Android (sem dependência de WebRTC) aplicados sobre o AudioRecord da
 * sessão de voz. O session ID deve ser registrado via setAudioSessionId()
 * pelo ArgosVoiceModule quando cria o AudioRecord.
 */
class AudioProcessingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AudioProcessing"

  private var aec: AcousticEchoCanceler? = null
  private var agc: AutomaticGainControl? = null
  private var ns: NoiseSuppressor? = null
  private var echoCancellationEnabled = false
  private val TAG = "ArgosAudioProcessing"

  companion object {
    /** Atualizado por ArgosVoiceModule quando cria o AudioRecord. */
    var audioSessionId: Int = -1
  }

  private fun ensureEffects(): Boolean {
    val sid = audioSessionId
    if (sid < 0) {
      Log.w(TAG, "audioSessionId não configurado — AEC indisponível")
      return false
    }
    if (aec == null && AcousticEchoCanceler.isAvailable()) {
      aec = AcousticEchoCanceler.create(sid)
    }
    if (agc == null && AutomaticGainControl.isAvailable()) {
      agc = AutomaticGainControl.create(sid)
    }
    if (ns == null && NoiseSuppressor.isAvailable()) {
      ns = NoiseSuppressor.create(sid)
    }
    return true
  }

  @ReactMethod
  fun enableEchoCancellation(enable: Boolean, promise: Promise) {
    try {
      if (ensureEffects()) {
        aec?.enabled = enable
        agc?.enabled = enable
        ns?.enabled = enable
      }
      echoCancellationEnabled = enable
      Log.d(TAG, "Echo cancellation ${if (enable) "enabled" else "disabled"} (hw AEC)")
      promise.resolve("ok")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to set echo cancellation: ${e.message}")
      promise.reject("AEC_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun isEchoCancellationEnabled(promise: Promise) {
    promise.resolve(echoCancellationEnabled)
  }

  @ReactMethod
  fun release(promise: Promise) {
    try {
      aec?.release(); aec = null
      agc?.release(); agc = null
      ns?.release();  ns = null
      echoCancellationEnabled = false
      Log.d(TAG, "AudioProcessing released")
      promise.resolve("ok")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to release AudioProcessing: ${e.message}")
      promise.reject("AEC_RELEASE_ERROR", e.message, e)
    }
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
}
