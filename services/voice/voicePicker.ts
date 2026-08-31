import type { AIPersonality } from '@/types/ai.types';

export type VoiceLike = {
  name: string;
  lang?: string;
  language?: string;
  voiceURI?: string;
  default?: boolean;
  identifier?: string;
};

export interface VoiceAnalysis {
  femaleVoiceName: string | null;
  maleVoiceName: string | null;
  hasDistinctMale: boolean;
  ptBrVoices: string[];
}

/* ─── Feminino: lógica estável (Luciana etc.) ─── */
const FEMALE_RE =
  /female|femin|mulher|woman|girl|senhora|maria|lucia|luciana|francisca|fernanda|vit[oó]ria|amanda|gabriela|helo[ií]sa|camila|leticia|let[ií]cia|raquel|m[oô]nica|paula|sandra|\bana\b|zira|samantha|catarina|beatriz|juliana|isabela|carolina|google portugu[eê]s do brasil.*feminino/i;

/* Masculino BR — Felipe (iPhone), Google/Microsoft BR, etc. */
const MALE_BR_RE =
  /masculino|felipe|tiago|leonardo|thiag|antonio|ant[oô]nio|bruno|gustavo|rafael|marcos|miguel|carlos|jo[aã]o|jos[eé]|pedro|paulo|ricardo|google portugu[eê]s do brasil.*male|portugu[eê]s.*brasil.*masculino|microsoft.*portugu[eê]s.*brasil|pt-br\.felipe|pt_br.*felipe|compact\.pt-br\.felipe|enhanced\.pt-br\.felipe|siri.*male/i;

const FEMALE_HINT_IN_NAME =
  /female|femin|mulher|maria|lucia|luciana|francisca|fernanda|vit[oó]ria|amanda|gabriela|camila|leticia|raquel|m[oô]nica|siri.*female/i;

/*
 * Vozes pt-BR do Google TTS no Android. Os identificadores sao codigos opacos
 * (`pt-br-x-afs-network`) e NAO trazem o genero no nome — por isso os regexes
 * por nome ("felipe", "tiago") nunca casavam e pickVoiceForPersonality devolvia
 * null, deixando o app usar a voz padrao (feminina) com pitch 0.72 forcado.
 * Era isso que soava robotico.
 *
 * Confirmado no aparelho do usuario (log [argos-voz], 31/08): existem 7 vozes
 * pt-BR instaladas — afs, pte e ptd, cada uma em -local e -network.
 *
 * `afs` e a voz feminina padrao do sistema. As demais sao as alternativas.
 * As variantes `-network` sao sintetizadas na nuvem do Google e soam bem
 * melhor que as `-local`.
 */
const GOOGLE_PTBR_FEMALE = /pt-br-x-afs/i;
const GOOGLE_PTBR_ALT = /pt-br-x-(pte|ptd)/i;
const NETWORK_VOICE = /-network/i;

function voiceLang(voice: VoiceLike): string {
  return (voice.lang ?? voice.language ?? '').toLowerCase().replace('_', '-');
}

function voiceKey(voice: VoiceLike): string {
  return `${voice.name}|${voice.voiceURI ?? voice.identifier ?? ''}`.toLowerCase();
}

function sameVoice(a: VoiceLike | null, b: VoiceLike | null): boolean {
  if (!a || !b) return false;
  return voiceKey(a) === voiceKey(b);
}

export function isClearlyFemaleVoice(voice: VoiceLike): boolean {
  if (GOOGLE_PTBR_FEMALE.test(voiceKey(voice))) return true;
  return FEMALE_HINT_IN_NAME.test(voiceKey(voice));
}

export function isMaleBrazilianVoice(voice: VoiceLike): boolean {
  if (isClearlyFemaleVoice(voice)) return false;
  // Codigo opaco do Google conta como alternativa a voz feminina padrao.
  if (GOOGLE_PTBR_ALT.test(voiceKey(voice))) return true;
  return MALE_BR_RE.test(voiceKey(voice));
}

export function voiceMatchesGender(voice: VoiceLike, gender: AIPersonality['voiceGender']): boolean {
  if (gender === 'female') {
    return FEMALE_RE.test(voiceKey(voice)) && !isMaleBrazilianVoice(voice);
  }
  return isMaleBrazilianVoice(voice);
}

function isForeignAccentForBrazil(voice: VoiceLike, targetLang: string): boolean {
  if (!targetLang.toLowerCase().startsWith('pt')) return false;

  const vlang = voiceLang(voice);
  const key = voiceKey(voice);

  if (vlang.startsWith('en-gb') || vlang.startsWith('en-')) return true;
  if (vlang === 'pt-pt') return true;

  if (
    /en-gb|en_uk|english.*\(uk\)|british english|google uk english|uk english/i.test(key)
  ) {
    return true;
  }

  if (/daniel/.test(key) && vlang !== 'pt-br' && !/brasil|brazil|pt-br|portugu[eê]s.*brasil/i.test(key)) {
    return true;
  }

  if (
    /george|harry|arthur|ryan|oliver|guy|thomas|james|david/.test(key) &&
    !/brasil|brazil|pt-br|portugu[eê]s|felipe|tiago/i.test(key)
  ) {
    return true;
  }

  return false;
}

function isPtBrVoice(voice: VoiceLike): boolean {
  const vlang = voiceLang(voice);
  const key = voiceKey(voice);
  return (
    vlang === 'pt-br' ||
    vlang.startsWith('pt') ||
    /brasil|brazil|pt-br|portugu[eê]s do brasil|felipe|luciana/i.test(key)
  );
}

function femaleScore(voice: VoiceLike, lang: string): number {
  const key = voiceKey(voice);
  let score = 0;
  const vlang = voiceLang(voice);
  if (vlang === lang.toLowerCase()) score += 30;
  else if (vlang.startsWith('pt')) score += 15;
  if (FEMALE_RE.test(key)) score += 40;
  if (isMaleBrazilianVoice(voice)) score -= 50;
  if (voice.default) score += 3;
  return score;
}

function maleBrazilScore(voice: VoiceLike): number {
  const key = voiceKey(voice);
  let score = 0;
  if (voiceLang(voice) === 'pt-br') score += 55;
  if (/brasil|brazil|pt-br|portugu[eê]s do brasil/i.test(key)) score += 35;
  if (MALE_BR_RE.test(key)) score += 60;
  if (GOOGLE_PTBR_ALT.test(key)) score += 50;
  // -network e sintetizada na nuvem do Google: bem menos robotica que -local.
  if (NETWORK_VOICE.test(key)) score += 25;
  if (isClearlyFemaleVoice(voice)) score -= 100;
  return score;
}

function pickFemaleVoice<T extends VoiceLike>(voices: T[], lang: string): T | null {
  const ptVoices = voices.filter((v) => isPtBrVoice(v) && !isForeignAccentForBrazil(v, lang));
  const pool = ptVoices.length > 0 ? ptVoices : voices;
  const ranked = [...pool].sort((a, b) => femaleScore(b, lang) - femaleScore(a, lang));
  return ranked[0] ?? null;
}

function pickMaleBrazilianVoice<T extends VoiceLike>(
  voices: T[],
  lang: string,
  femaleVoice: T | null
): T | null {
  const eligible = voices.filter(
    (v) =>
      !isForeignAccentForBrazil(v, lang) &&
      !isClearlyFemaleVoice(v) &&
      !sameVoice(v, femaleVoice)
  );

  const explicitMale = eligible.filter(isMaleBrazilianVoice);
  if (explicitMale.length > 0) {
    explicitMale.sort((a, b) => maleBrazilScore(b) - maleBrazilScore(a));
    return explicitMale[0];
  }

  /* Sem Felipe/outra voz masculina instalada — não reutiliza Luciana */
  return null;
}

/** Escolhe a melhor voz do sistema para idioma + gênero. */
export function pickVoiceForPersonality<T extends VoiceLike>(
  voices: T[],
  personality: Pick<AIPersonality, 'language' | 'voiceGender'>
): T | null {
  if (voices.length === 0) return null;

  const lang = personality.language ?? 'pt-BR';
  const femaleVoice = pickFemaleVoice(voices, lang);

  if (personality.voiceGender === 'male') {
    const femaleVoice = pickFemaleVoice(voices, lang);
    const male = pickMaleBrazilianVoice(voices, lang, femaleVoice);
    if (male) return male;
    const felipe = voices.find(
      (v) => /felipe/i.test(voiceKey(v)) && !isClearlyFemaleVoice(v)
    );
    return felipe ?? null;
  }

  return femaleVoice;
}

export function analyzeDeviceVoices(
  voices: VoiceLike[],
  lang = 'pt-BR'
): VoiceAnalysis {
  const female = pickFemaleVoice(voices, lang);
  const male = pickMaleBrazilianVoice(voices, lang, female);

  /* iOS: Felipe pode vir só no nome */
  const felipe = voices.find((v) => /felipe/i.test(voiceKey(v)) && !isClearlyFemaleVoice(v));
  const resolvedMale = male ?? felipe ?? null;

  const ptBrVoices = voices
    .filter(isPtBrVoice)
    .map((v) => v.name)
    .filter((n, i, arr) => arr.indexOf(n) === i);

  return {
    femaleVoiceName: female?.name ?? null,
    maleVoiceName: resolvedMale?.name ?? null,
    hasDistinctMale: resolvedMale !== null && !sameVoice(resolvedMale, female),
    ptBrVoices,
  };
}

/** Pitch quando não há voz masculina dedicada no aparelho. */
export function fallbackPitch(gender: AIPersonality['voiceGender']): number {
  return gender === 'female' ? 1.15 : 0.72;
}

export function pitchForUtterance(
  voice: VoiceLike | null,
  gender: AIPersonality['voiceGender']
): number {
  if (voice && voiceMatchesGender(voice, gender)) return 1.0;
  if (gender === 'male') return 0.72;
  return fallbackPitch(gender);
}

export function snapVoiceSpeed(speed: number): number {
  const options = [0.75, 0.9, 1.0, 1.2, 1.4];
  return options.reduce((best, v) =>
    Math.abs(v - speed) < Math.abs(best - speed) ? v : best
  );
}
