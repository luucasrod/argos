import type { AIPersonality } from '@/types/ai.types';

export type VoiceLike = {
  name: string;
  lang?: string;
  language?: string;
  voiceURI?: string;
  default?: boolean;
  identifier?: string;
};

const FEMALE_RE =
  /female|femin|mulher|woman|girl|senhora|maria|lucia|luciana|francisca|fernanda|vit[oó]ria|amanda|gabriela|helo[ií]sa|camila|leticia|let[ií]cia|raquel|m[oô]nica|paula|sandra|\bana\b|zira|samantha|catarina|beatriz|juliana|isabela|carolina|google portugu[eê]s do brasil.*feminino/i;

const MALE_RE =
  /male|masc|homem|man|boy|senhor|jo[aã]o|jos[eé]|carlos|paulo|pedro|ricardo|daniel|felipe|bruno|lucas|tiago|miguel|david|james|thomas|antonio|ant[oô]nio|marcos|rafael|gustavo|google portugu[eê]s do brasil.*masculino/i;

function voiceLang(voice: VoiceLike): string {
  return voice.lang ?? voice.language ?? '';
}

function voiceKey(voice: VoiceLike): string {
  return `${voice.name}|${voice.voiceURI ?? voice.identifier ?? ''}`.toLowerCase();
}

export function voiceMatchesGender(voice: VoiceLike, gender: AIPersonality['voiceGender']): boolean {
  const key = voiceKey(voice);
  const female = FEMALE_RE.test(key);
  const male = MALE_RE.test(key);
  if (gender === 'female') return female && !male;
  return male && !female;
}

function langScore(voice: VoiceLike, lang: string): number {
  const vlang = voiceLang(voice);
  const prefix = lang.split('-')[0];
  if (vlang === lang) return 30;
  if (vlang.startsWith(prefix)) return 20;
  if (vlang.includes(prefix)) return 10;
  return 0;
}

function genderScore(voice: VoiceLike, gender: AIPersonality['voiceGender']): number {
  const key = voiceKey(voice);
  const female = FEMALE_RE.test(key);
  const male = MALE_RE.test(key);
  if (gender === 'female') {
    if (female && !male) return 40;
    if (male && !female) return -40;
  } else {
    if (male && !female) return 40;
    if (female && !male) return -40;
  }
  return 0;
}

/** Escolhe a melhor voz do sistema para idioma + gênero. */
export function pickVoiceForPersonality<T extends VoiceLike>(
  voices: T[],
  personality: Pick<AIPersonality, 'language' | 'voiceGender'>
): T | null {
  if (voices.length === 0) return null;

  const lang = personality.language ?? 'pt-BR';
  const ranked = [...voices].sort((a, b) => {
    const scoreA =
      langScore(a, lang) + genderScore(a, personality.voiceGender) + (a.default ? 3 : 0);
    const scoreB =
      langScore(b, lang) + genderScore(b, personality.voiceGender) + (b.default ? 3 : 0);
    return scoreB - scoreA;
  });

  return ranked[0] ?? null;
}

/** Pitch de reforço quando não há voz do gênero no dispositivo. */
export function fallbackPitch(gender: AIPersonality['voiceGender']): number {
  return gender === 'female' ? 1.2 : 0.78;
}

export function pitchForUtterance(
  voice: VoiceLike | null,
  gender: AIPersonality['voiceGender']
): number {
  if (voice && voiceMatchesGender(voice, gender)) return 1.0;
  return fallbackPitch(gender);
}

/** Arredonda velocidade para a opção mais próxima. */
export function snapVoiceSpeed(speed: number): number {
  const options = [0.75, 0.9, 1.0, 1.2, 1.4];
  return options.reduce((best, v) =>
    Math.abs(v - speed) < Math.abs(best - speed) ? v : best
  );
}
