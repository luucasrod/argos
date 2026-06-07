import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { Colors } from '@/constants/colors';

enableScreens(false);

export default function RootLayout() {
  useEffect(() => {
    document.documentElement.style.backgroundColor = Colors.bg.primary;
    document.body.style.backgroundColor = Colors.bg.primary;
  }, []);
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bg.primary },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    width: '100%',
  },
});
