import { Stack } from 'expo-router';
import { Colors } from '@/constants/colors';

export default function ModalsLayoutWeb() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg.primary },
        presentation: 'modal',
      }}
    >
      <Stack.Screen name="memory" />
      <Stack.Screen name="create-automation" />
      <Stack.Screen name="execution" />
      <Stack.Screen name="routine-detail" />
    </Stack>
  );
}
