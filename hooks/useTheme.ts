import { useSettingsStore } from '@/stores/useSettingsStore';
import { Colors } from '@/constants/colors';

export function useTheme() {
  const { settings } = useSettingsStore();
  const isAmoled = settings.theme === 'amoled';

  return {
    colors: Colors,
    isDark: true,
    isAmoled,
    backgroundColor: isAmoled ? '#000000' : Colors.bg.primary,
    reducedMotion: settings.reducedMotion,
  };
}
