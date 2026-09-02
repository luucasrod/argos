/**
 * suspiciousVoiceAttempts.ts — registra localmente comandos de voz que o Vosk
 * provavelmente entendeu errado, para alimentar a curadoria futura da
 * gramática (A-043) com uso real em vez de só intuição.
 *
 * Por que existe: o Vosk já avisa no logcat quando descarta uma palavra fora
 * do vocabulário ("Ignoring word missing in vocabulary"), mas esse aviso é
 * nativo, efêmero e ninguém relia até virar bug (ver docs/ai/CONTEXT.md,
 * regra do acento). Esta captura fica do lado JS, permanente, sem depender de
 * ninguém estar de olho no logcat na hora certa.
 *
 * Só texto e metadados — nunca áudio bruto (privacidade). Escrita é
 * best-effort: qualquer falha aqui é engolida, nunca deve atrapalhar o
 * fluxo de voz principal.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SuspiciousAttemptReason =
  /** Falou por um tempo relativamente longo, mas o texto final ficou curto
   *  demais — sinal de que boa parte da fala foi descartada pela gramática
   *  fechada (palavra fora do vocabulário, ruído, etc). */
  | 'curta_para_duracao'
  /** Uma nova wake word + comando chegou pouco depois do anterior — sinal
   *  comum de "ele não me entendeu, vou tentar de novo". */
  | 'reformulacao_rapida';

export type SuspiciousAttempt = {
  timestamp: number;
  text: string;
  /** Duração aproximada da fala (do início da captura até o silêncio que a encerrou), em ms. */
  speechMs: number;
  reason: SuspiciousAttemptReason;
};

const STORAGE_KEY = 'argos_suspicious_voice_attempts';
/** Teto para não crescer sem limite — mantém só as tentativas mais recentes. */
const MAX_ENTRIES = 200;

let cache: SuspiciousAttempt[] | null = null;

async function load(): Promise<SuspiciousAttempt[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as SuspiciousAttempt[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Registra uma tentativa suspeita. Nunca lança — falha em silêncio. */
export async function recordSuspiciousAttempt(
  entry: Omit<SuspiciousAttempt, 'timestamp'>
): Promise<void> {
  try {
    const list = await load();
    list.push({ ...entry, timestamp: Date.now() });
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
    cache = list;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // best-effort — captura de diagnóstico não pode derrubar o fluxo de voz.
  }
}

/** Lista inspecionável das tentativas suspeitas registradas até agora. */
export async function getSuspiciousAttempts(): Promise<SuspiciousAttempt[]> {
  return load();
}

export async function clearSuspiciousAttempts(): Promise<void> {
  cache = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem — best-effort.
  }
}
