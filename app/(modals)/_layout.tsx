import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { Colors } from '@/constants/colors';

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg.primary },
        presentation: 'modal',
        animation: Platform.OS === 'web' ? 'default' : 'slide_from_bottom',
      }}
    >
      <Stack.Screen name="memory" />
      <Stack.Screen name="create-automation" />
      <Stack.Screen name="execution" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Stack.Screen name="routine-detail" />
      <Stack.Screen name="integracoes" />
    </Stack>
  );
}
