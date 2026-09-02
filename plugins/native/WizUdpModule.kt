package com.masya.argos.modules

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import kotlin.concurrent.thread

/**
 * WizUdpModule — controle das lâmpadas Philips WiZ direto na rede local.
 *
 * Reescrita depois de perdida num `expo prebuild` (android/ é gitignored) —
 * ver docs/ai/CONTEXT.md. Injetado por config plugin (plugins/
 * withWizUdpModule.js) para sobreviver ao próximo prebuild.
 *
 * Protocolo documentado pela comunidade (pywizlight, integração WiZ do Home
 * Assistant): UDP porta 38899, JSON puro, sem criptografia, sem conta.
 * `getPilot`/`setPilot` são unicast pro IP da lâmpada; `discover` é broadcast
 * na sub-rede.
 *
 * Módulo antigo-estilo (ReactContextBaseJavaModule + ReactPackage), não
 * TurboModule com codegen — de propósito: services/devices/
 * wizLocalDirect.native.ts já lê via `NativeModules.WizUdp` (bridge
 * legado), que a Nova Arquitetura continua suportando via interop. Reescrever
 * como TurboModule exigiria mudar também o lado JS, que a issue pede pra
 * manter como está ("a guarda `if (!WizUdp)` já existe").
 */
private const val WIZ_PORT = 38899
private const val RECEIVE_BUFFER_SIZE = 2048

class WizUdpModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "WizUdp"

  @ReactMethod
  fun getPilot(ip: String, timeoutMs: Int, promise: Promise) {
    thread {
      try {
        DatagramSocket().use { socket ->
          socket.soTimeout = timeoutMs
          sendJson(socket, ip, JSONObject().put("method", "getPilot"))

          val response = receive(socket)
          val result = response?.optJSONObject("result")
          promise.resolve(pilotResultToMap(result))
        }
      } catch (e: SocketTimeoutException) {
        // Lâmpada não respondeu a tempo — offline ou IP errado, não é erro fatal.
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("WIZ_GET_PILOT_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun setPilot(ip: String, paramsJson: String, timeoutMs: Int, promise: Promise) {
    thread {
      try {
        DatagramSocket().use { socket ->
          socket.soTimeout = timeoutMs
          val params = JSONObject(paramsJson)
          sendJson(socket, ip, JSONObject().put("method", "setPilot").put("params", params))

          try {
            val response = receive(socket)
            val success = response?.optJSONObject("result")?.optBoolean("success", true) ?: true
            promise.resolve(success)
          } catch (e: SocketTimeoutException) {
            // Alguns firmwares aplicam o comando sem confirmar por ACK — sem
            // resposta não significa que falhou.
            promise.resolve(true)
          }
        }
      } catch (e: Exception) {
        promise.reject("WIZ_SET_PILOT_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun discover(timeoutMs: Int, promise: Promise) {
    thread {
      // mac -> ip, LinkedHashMap para manter a ordem de chegada e não duplicar
      // a mesma lâmpada se ela responder mais de uma vez dentro da janela.
      val found = LinkedHashMap<String, String>()
      try {
        DatagramSocket().use { socket ->
          socket.broadcast = true
          socket.soTimeout = 300

          val registration = JSONObject().put("method", "registration").put(
            "params",
            JSONObject()
              .put("phoneMac", "aaaaaaaaaaaa")
              .put("register", false)
              .put("phoneIp", localIpAddress())
          )
          val data = registration.toString().toByteArray(StandardCharsets.UTF_8)
          val broadcast = InetAddress.getByName("255.255.255.255")
          socket.send(DatagramPacket(data, data.size, broadcast, WIZ_PORT))

          val deadline = System.currentTimeMillis() + timeoutMs
          val buffer = ByteArray(RECEIVE_BUFFER_SIZE)
          while (System.currentTimeMillis() < deadline) {
            try {
              val packet = DatagramPacket(buffer, buffer.size)
              socket.receive(packet)
              val json = JSONObject(
                String(packet.data, 0, packet.length, StandardCharsets.UTF_8)
              )
              val mac = json.optJSONObject("result")?.optString("mac")
              val hostAddress = packet.address?.hostAddress
              if (!mac.isNullOrEmpty() && hostAddress != null) {
                found[mac] = hostAddress
              }
            } catch (e: SocketTimeoutException) {
              // Sem resposta neste ciclo de 300ms — continua até o deadline geral.
            } catch (e: org.json.JSONException) {
              // Pacote não é um JSON válido da WiZ — ignora e continua ouvindo.
            }
          }
        }
      } catch (e: Exception) {
        // Falha ao abrir/usar o socket de broadcast não é fatal: devolve o que
        // já tiver sido descoberto até aqui (possivelmente vazio).
      }

      val array = Arguments.createArray()
      for ((mac, ip) in found) {
        array.pushMap(
          Arguments.createMap().apply {
            putString("mac", mac)
            putString("ip", ip)
          }
        )
      }
      promise.resolve(array)
    }
  }

  private fun sendJson(socket: DatagramSocket, ip: String, body: JSONObject) {
    val data = body.toString().toByteArray(StandardCharsets.UTF_8)
    val address = InetAddress.getByName(ip)
    socket.send(DatagramPacket(data, data.size, address, WIZ_PORT))
  }

  private fun receive(socket: DatagramSocket): JSONObject? {
    val buffer = ByteArray(RECEIVE_BUFFER_SIZE)
    val packet = DatagramPacket(buffer, buffer.size)
    socket.receive(packet)
    return JSONObject(String(packet.data, 0, packet.length, StandardCharsets.UTF_8))
  }

  private fun pilotResultToMap(result: JSONObject?): com.facebook.react.bridge.WritableMap? {
    if (result == null) return null
    return Arguments.createMap().apply {
      putString("mac", result.optString("mac", ""))
      putBoolean("state", result.optBoolean("state", false))
      putOptionalInt(this, "dimming", result)
      putOptionalInt(this, "temp", result)
      putOptionalInt(this, "r", result)
      putOptionalInt(this, "g", result)
      putOptionalInt(this, "b", result)
    }
  }

  private fun putOptionalInt(
    map: com.facebook.react.bridge.WritableMap,
    key: String,
    source: JSONObject
  ) {
    if (source.has(key) && !source.isNull(key)) {
      map.putInt(key, source.optInt(key))
    } else {
      map.putNull(key)
    }
  }

  /** Melhor esforço: primeiro IPv4 não-loopback de uma interface ativa. */
  private fun localIpAddress(): String {
    try {
      val interfaces = NetworkInterface.getNetworkInterfaces()
      while (interfaces.hasMoreElements()) {
        val iface = interfaces.nextElement()
        if (!iface.isUp || iface.isLoopback) continue
        val addresses = iface.inetAddresses
        while (addresses.hasMoreElements()) {
          val addr = addresses.nextElement()
          if (addr is Inet4Address) return addr.hostAddress ?: continue
        }
      }
    } catch (e: Exception) {
      // Sem interface disponível — a lâmpada ainda responde por broadcast
      // mesmo com um phoneIp incorreto; só o registro fica menos preciso.
    }
    return "0.0.0.0"
  }
}
