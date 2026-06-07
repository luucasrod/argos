import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/useSettingsStore';

export function useHaptic() {
  const { settings } = useSettingsStore();

  const run = (fn: () => Promise<void>) => {
    if (!settings.hapticFeedback) return;
    fn().catch(() => {});
  };

  const light = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  const medium = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  const heavy = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  const success = () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  const error = () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

  return { light, medium, heavy, success, error };
}
