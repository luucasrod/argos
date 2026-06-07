import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { useVoice } from '@/hooks/useVoice';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoice();

  const handlePress = async () => {
    if (isListening) {
      await stopListening();
      if (transcript) {
        onTranscript(transcript);
        setTranscript('');
      }
    } else {
      await startListening();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.button, isListening && styles.buttonActive]}
    >
      <Text style={styles.icon}>{isListening ? '⏹' : '🎙'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.glass.heavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: { backgroundColor: Colors.accent.primary },
  icon: { fontSize: 18 },
});
