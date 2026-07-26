import { Platform } from 'react-native';

/**
 * No browser, URLs relativas (/api/...) funcionam diretamente.
 * No app nativo, fetch não tem URL base — precisa de URL absoluta apontando para o Vercel.
 */
export const API_BASE: string =
  Platform.OS === 'web'
    ? ''
    : (process.env.EXPO_PUBLIC_API_URL ?? 'https://argos-blue.vercel.app');
