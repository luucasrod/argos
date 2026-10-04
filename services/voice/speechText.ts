import type { ParsedIntent } from '@/services/ai/intentParser';

/* Cobre os blocos Unicode de emoji/pictogramas/dingbats — removidos antes do TTS
   pra evitar o sintetizador "falar" o nome do emoji (ex: "carinha sorridente"). */
const EMOJI_RE = new RegExp(
  '[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2190}-\\u{21FF}\\u{2B00}-\\u{2BFF}\\u{FE0F}\\u{200D}]',
  'gu'
);

/** Remove emojis do texto (rede de segurança caso o modelo ignore a instrução). */
export function stripEmojis(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Prepara o texto para leitura em voz alta.
 *
 * O sintetizador lê símbolo como símbolo: sem esta limpeza ele fala "asterisco",
 * "cerquilha" e o endereço inteiro de um link. Cobre negrito, itálico, títulos,
 * listas, código, tabelas e links.
 */
export function stripForSpeech(text: string): string {
  return stripEmojis(
    text
      // links [texto](url) -> texto
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // blocos e trechos de código
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      // títulos e citações no início da linha
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      // marcadores de lista no início da linha
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // separadores de tabela e linhas horizontais
      .replace(/^\s*\|?[\s:|-]{4,}\|?\s*$/gm, ' ')
      .replace(/\|/g, ' ')
      // negrito, itálico e riscado
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      // sobras de marcação soltas
      .replace(/[*_`#]/g, '')
      // quebras viram pausa falada
      .replace(/\n+/g, '. ')
      .replace(/\.\s*\.\s*/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** Texto que o Argos deve falar — sempre tenta speech, depois text. */
export function resolveIntentSpeech(intent: ParsedIntent): string {
  const speech = intent.speech?.trim();
  if (speech) return stripForSpeech(speech);
  const text = intent.text?.trim();
  if (text) return stripForSpeech(text);
  return '';
}

/**
 * Pré-processa texto para leitura natural em pt-BR pelo TTS.
 *
 * O ElevenLabs recebe texto bruto como "23.5°C" ou "15km/h" e os pronuncia
 * de forma estranha. Esta função converte essas expressões para formas que
 * o sintetizador lê corretamente.
 *
 * Ordem importa: tratar sequências específicas antes das genéricas.
 */
export function preprocessForSpeech(text: string): string {
  return (
    text
      // Moeda: R$25,50 → "25 reais e 50 centavos"
      .replace(/R\$\s*(\d+),(\d{2})/g, (_m, int, dec) => {
        const intN = parseInt(int, 10);
        const decN = parseInt(dec, 10);
        const reaisPart = `${intN} ${intN === 1 ? 'real' : 'reais'}`;
        if (decN === 0) return reaisPart;
        const centavosPart = `${decN} ${decN === 1 ? 'centavo' : 'centavos'}`;
        return `${reaisPart} e ${centavosPart}`;
      })
      // Moeda inteira: R$25 → "25 reais"
      .replace(/R\$\s*(\d+)(?![,\d])/g, (_m, n) => {
        const v = parseInt(n, 10);
        return `${v} ${v === 1 ? 'real' : 'reais'}`;
      })
      // Temperatura com decimal: 23.5°C → "23 vírgula 5 graus"
      .replace(/(-?\d+)\.(\d+)\s*°[Cc]/g, (_m, int, dec) => `${int} vírgula ${dec} graus`)
      // Temperatura inteira: 23°C → "23 graus"
      .replace(/(-?\d+)\s*°[Cc]/g, '$1 graus')
      // Velocidade km/h: 15km/h → "15 quilômetros por hora"
      .replace(/(\d+(?:[.,]\d+)?)\s*km\/h/gi, '$1 quilômetros por hora')
      // Velocidade m/s: 15m/s → "15 metros por segundo"
      .replace(/(\d+(?:[.,]\d+)?)\s*m\/s/g, '$1 metros por segundo')
      // Grau sozinho: 15° → "15 graus"
      .replace(/(-?\d+(?:[.,]\d+)?)\s*°/g, '$1 graus')
      // Percentual: 70% → "70 por cento"
      .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 por cento')
      // Decimais com ponto → vírgula em contexto numérico (sem unidade já tratada)
      .replace(/(\d+)\.(\d+)/g, '$1 vírgula $2')
  );
}

/*
 * A-022: confirmação sutil para ações triviais bem-sucedidas, quando o
 * usuário escolhe verbosidade mínima. Só entra em uso nos pontos que o
 * chamador já sabe serem triviais (sem risco, sem ambiguidade, sem falha) —
 * quem decide ISSO é o chamador (hooks/useArgos.ts), nunca esta função.
 * Confirmação de risco (autonomia assistida) e qualquer erro continuam
 * sempre falando a frase completa, em qualquer nível de verbosidade.
 */
const MINIMAL_CONFIRMATIONS = ['Feito.', 'Pronto.', 'Ok, feito.'];

/** Frase curta aleatória pra confirmar uma ação trivial (ver comentário acima). */
export function minimalConfirmation(): string {
  return MINIMAL_CONFIRMATIONS[Math.floor(Math.random() * MINIMAL_CONFIRMATIONS.length)];
}
