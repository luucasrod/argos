import { useState, useEffect } from 'react'
import {
  PermissionsAndroid,
  Platform,
  NativeModules,
  NativeEventEmitter,
} from 'react-native'

const { ArgosVoiceModule } = NativeModules

/**
 * Hook para ativar/desativar escuta de voz em background
 *
 * Features:
 * - Pede permissão RECORD_AUDIO com "Permitir o tempo todo"
 * - Inicia ArgosBackgroundService
 * - Monitora status da voz
 */
export function useVoiceActivation() {
  const [isListening, setIsListening] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Checa e pede permissão de microfone
   */
  const requestMicrophonePermission = async () => {
    if (Platform.OS !== 'android') {
      setError('Voice only available on Android')
      return false
    }

    try {
      const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      const result = await PermissionsAndroid.request(permission, {
        title: 'Argos Precisa de Acesso ao Microfone',
        message: 'Argos precisa do microfone para ouvir "Argos" e executar seus comandos.',
        buttonPositive: 'Permitir o Tempo Todo',
        buttonNegative: 'Cancelar',
        buttonNeutral: 'Apenas Durante o Uso',
      })

      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        setHasPermission(true)
        return true
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setError(
          'Permissão de microfone negada. Vá em Configurações > Argos > Permissões > Microfone e ative "Permitir o tempo todo"'
        )
        return false
      } else {
        setError('Permissão de microfone necessária')
        return false
      }
    } catch (err) {
      setError(`Erro ao solicitar permissão: ${err}`)
      return false
    }
  }

  /**
   * Inicia o serviço de voz em background
   */
  const startVoice = async () => {
    try {
      setError(null)

      // 1. Checar permissão
      const hasPerm = await requestMicrophonePermission()
      if (!hasPerm) {
        setIsListening(false)
        return
      }

      // 2. Iniciar serviço (se existir o módulo)
      if (ArgosVoiceModule?.startVoiceService) {
        await ArgosVoiceModule.startVoiceService()
      }

      setIsListening(true)
      console.log('✓ Voice service started')
    } catch (err) {
      setError(`Erro ao iniciar voz: ${err}`)
      setIsListening(false)
    }
  }

  /**
   * Para o serviço de voz
   */
  const stopVoice = async () => {
    try {
      if (ArgosVoiceModule?.stopVoiceService) {
        await ArgosVoiceModule.stopVoiceService()
      }
      setIsListening(false)
      console.log('✓ Voice service stopped')
    } catch (err) {
      setError(`Erro ao parar voz: ${err}`)
    }
  }

  /**
   * Toggle: ativar/desativar
   */
  const toggleVoice = async () => {
    if (isListening) {
      await stopVoice()
    } else {
      await startVoice()
    }
  }

  /**
   * Monitora eventos de voz
   */
  useEffect(() => {
    if (!ArgosVoiceModule) return

    const eventEmitter = new NativeEventEmitter(ArgosVoiceModule)

    const subscriptions = [
      eventEmitter.addListener('wakeWordDetected', () => {
        console.log('🎤 Wake word detected!')
      }),
      eventEmitter.addListener('voiceError', (error) => {
        console.error('❌ Voice error:', error)
        setError(error)
      }),
    ]

    return () => {
      subscriptions.forEach((sub) => sub.remove())
    }
  }, [])

  return {
    isListening,
    hasPermission,
    error,
    startVoice,
    stopVoice,
    toggleVoice,
    requestPermission: requestMicrophonePermission,
  }
}
