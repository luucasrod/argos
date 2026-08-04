import React, { useEffect, useState } from 'react'
import { View, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native'
import { useVoiceActivation } from '@/hooks/useVoiceActivation'
import { Ionicons } from '@expo/vector-icons'

/**
 * Botão visual pra ativar/desativar voz
 * Mostra status e erros
 */
export function VoiceActivationButton() {
  const { isListening, error, toggleVoice } = useVoiceActivation()
  const [status, setStatus] = useState('Inativo')

  useEffect(() => {
    if (error) {
      setStatus('❌ Erro'
      Alert.alert('Erro de Voz', error)
    } else if (isListening) {
      setStatus('🎤 Ouvindo "Argos"')
    } else {
      setStatus('Inativo')
    }
  }, [isListening, error])

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isListening && styles.buttonActive]}
        onPress={toggleVoice}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isListening ? 'mic' : 'mic-off'}
          size={32}
          color={isListening ? '#10b981' : '#6b7280'}
        />
        <Text style={[styles.text, isListening && styles.textActive]}>
          {status}
        </Text>
      </TouchableOpacity>

      {error && (
        <Text style={styles.errorText}>
          ⚠️ {error.substring(0, 50)}...
        </Text>
      )}

      <Text style={styles.hint}>
        {isListening
          ? 'Diga "Argos" perto do celular'
          : 'Clique para ativar a escuta'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  buttonActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  textActive: {
    color: '#10b981',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
})
