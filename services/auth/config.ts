import Constants from 'expo-constants';

/** Quando true, o app funciona sem login (apenas para testes). */
export function isAuthRequired(): boolean {
  const fromEnv = process.env.EXPO_PUBLIC_SKIP_AUTH === 'true';
  const fromExtra = Constants.expoConfig?.extra?.skipAuth === true;
  return !(fromEnv || fromExtra);
}

export function isTestMode(): boolean {
  return !isAuthRequired();
}
