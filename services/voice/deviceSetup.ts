/**
 * deviceSetup.ts — instruções e atalhos para liberar a escuta em segundo plano.
 *
 * Por que isso precisa existir: para o Argos ouvir com o app fechado, o Android
 * exige duas liberações que NÃO são a permissão de microfone, e que cada
 * fabricante esconde num lugar diferente:
 *   1. isenção de otimização de bateria (senão o sistema congela o processo);
 *   2. "autostart" / início automático, que Xiaomi, Huawei, Oppo e Vivo
 *      adicionaram por cima do Android e sem o qual o app morre ao ser fechado.
 * Ninguém acha isso sozinho, então o app pede e leva a pessoa até a tela.
 *
 * Usa só o que já existe no core do React Native (Linking.openSettings e
 * Linking.sendIntent) — nada de módulo nativo novo, então entra por OTA.
 */
import { Linking, Platform } from 'react-native';

export interface SetupStep {
  key: string;
  title: string;
  why: string;
  /** Onde tocar depois que a tela abrir. */
  hint: string;
  action: () => Promise<void>;
  actionLabel: string;
}

function manufacturer(): string {
  if (Platform.OS !== 'android') return '';
  const c = Platform.constants as { Manufacturer?: string; Brand?: string };
  return (c?.Manufacturer || c?.Brand || '').toLowerCase();
}

/** Abre a tela de informações do app (onde ficam autostart e bateria). */
async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // sem tela de settings disponível — nada a fazer
  }
}

/** Abre a lista de isenção de otimização de bateria do sistema. */
async function openBatterySettings(): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    // Nem todo aparelho expõe essa tela — cai para as infos do app.
    await openAppSettings();
  }
}

/**
 * Dica de autostart por fabricante. O caminho real varia, então o texto aponta o
 * nome que a opção costuma ter em cada marca em vez de prometer um caminho fixo.
 */
function autostartHint(): string {
  const m = manufacturer();

  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) {
    return 'Procure "Autostart" ou "Início automático" e ligue. Depois, em "Economia de bateria", escolha "Sem restrições".';
  }
  if (m.includes('huawei') || m.includes('honor')) {
    return 'Em "Bateria" → "Inicialização do app", desligue o gerenciamento automático e marque as três opções.';
  }
  if (m.includes('oppo') || m.includes('realme') || m.includes('oneplus')) {
    return 'Procure "Início automático" e ligue. Em "Uso de bateria", escolha "Permitir atividade em segundo plano".';
  }
  if (m.includes('vivo') || m.includes('iqoo')) {
    return 'Em "Bateria" → "Consumo em segundo plano de alta potência", permita o Argos.';
  }
  if (m.includes('samsung')) {
    return 'Em "Bateria", desligue "Colocar app em suspensão" e adicione o Argos aos apps sem restrição.';
  }
  if (m.includes('motorola') || m.includes('lenovo')) {
    return 'Em "Bateria", escolha "Sem restrições" para o Argos.';
  }
  return 'Procure por "Bateria" e escolha a opção sem restrições em segundo plano.';
}

export function needsAutostartStep(): boolean {
  const m = manufacturer();
  return (
    m.includes('xiaomi') ||
    m.includes('redmi') ||
    m.includes('poco') ||
    m.includes('huawei') ||
    m.includes('honor') ||
    m.includes('oppo') ||
    m.includes('realme') ||
    m.includes('oneplus') ||
    m.includes('vivo') ||
    m.includes('iqoo')
  );
}

export function deviceLabel(): string {
  if (Platform.OS !== 'android') return '';
  const c = Platform.constants as { Manufacturer?: string; Model?: string };
  return [c?.Manufacturer, c?.Model].filter(Boolean).join(' ');
}

export function buildSetupSteps(): SetupStep[] {
  const steps: SetupStep[] = [
    {
      key: 'battery',
      title: 'Liberar bateria',
      why: 'Sem isso o sistema congela o Argos alguns minutos depois de você sair do app, e ele para de ouvir.',
      hint: 'Na lista que abrir, encontre o Argos e escolha "Não otimizar" ou "Sem restrições".',
      action: openBatterySettings,
      actionLabel: 'Abrir isenção de bateria',
    },
  ];

  if (needsAutostartStep()) {
    steps.push({
      key: 'autostart',
      title: 'Permitir início automático',
      why: `Seu aparelho (${deviceLabel()}) encerra apps em segundo plano por conta própria, mesmo com a bateria liberada.`,
      hint: autostartHint(),
      action: openAppSettings,
      actionLabel: 'Abrir ajustes do Argos',
    });
  }

  return steps;
}
