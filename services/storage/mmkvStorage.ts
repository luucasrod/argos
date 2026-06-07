import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({ id: 'argos-storage' });

export const mmkvStorage = {
  getString: (key: string) => storage.getString(key),
  set: (key: string, value: string | number | boolean) => storage.set(key, value),
  delete: (key: string) => storage.remove(key),
  clearAll: () => storage.clearAll(),
};
