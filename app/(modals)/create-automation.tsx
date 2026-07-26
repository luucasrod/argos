import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/components/ui/GlassCard';
import { useArgos } from '@/hooks/useArgos';
import { Colors } from '@/constants/colors';

export default function CreateAutomationModal() {
  const [input, setInput] = useState('');
  const { sendMessage } = useArgos();

  const handleCreate = async () => {
    if (!input.trim()) return;
    await sendMessage(`Crie uma automação: ${input}`);
    router.back();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Nova automação</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <GlassCard style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Descreva a automação..."
            placeholderTextColor={Colors.text.muted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable style={styles.button} onPress={handleCreate}>
            <Text style={styles.buttonText}>✨ Criar com IA</Text>
          </Pressable>
        </GlassCard>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  title: { color: Colors.text.primary, fontSize: 22, fontWeight: '700' },
  close: { color: Colors.text.secondary, fontSize: 20 },
  card: { padding: 16, gap: 16 },
  input: { color: Colors.text.primary, minHeight: 100, fontSize: 16 },
  button: { backgroundColor: Colors.accent.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
