/**
 * emotionEngine.ts — determina como o Argos expressa cada resposta (V-009).
 *
 * Produz um EmotionState estruturado com intenção expressiva, não comandos
 * diretos ao TTS. Cada adaptador TTS traduz só os parâmetros que suporta.
 *
 * Decisão de design: detecção heurística (sem chamada extra ao LLM).
 * Custo = zero latência, zero tokens. Precisão suficiente para naturalidade
 * — não para representação teatral.
 *
 * Estados: neutral | friendly | excited | curious | serious | empathetic |
 *          urgent | playful
 */

export type EmotionTag =
  | 'neutral'
  | 'friendly'
  | 'excited'
  | 'curious'
  | 'serious'
  | 'empathetic'
  | 'urgent'
  | 'playful';

export interface EmotionState {
  emotion: EmotionTag;
  /** 0.0 (sutil) — 1.0 (máximo). Controla magnitude de todos os parâmetros. */
  intensity: number;
  /** Taxa de fala normalizada: 1.0 = normal, 1.1 = 10% mais rápido. */
  speakingRate: number;
  /** Ajuste de tom em pontos percentuais SSML (-10 a +10). */
  pitchShift: number;
  /** Perfil de pausa: minimal = contínuo, expressive = pausa dramática. */
  pauseProfile: 'minimal' | 'natural' | 'expressive';
  /** Descrição legível — para debugging e logs. */
  delivery: string;
  /**
   * Parâmetro `style` do ElevenLabs (0.0–1.0). 0 = mais estável/conservador,
   * 1 = máxima expressividade. Não todos os modelos suportam.
   */
  style: number;
}

/** Retorna um EmotionState neutro para fallback quando nada é detectado. */
export function neutralState(): EmotionState {
  return {
    emotion: 'neutral',
    intensity: 0.3,
    speakingRate: 1.0,
    pitchShift: 0,
    pauseProfile: 'natural',
    delivery: 'natural',
    style: 0.0,
  };
}

// ---------------------------------------------------------------------------
// Heurísticas de detecção
// ---------------------------------------------------------------------------

/** Conta ocorrências de um padrão no texto (case-insensitive). */
function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/** true se o texto termina com pergunta. */
function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim());
}

/** Pontuação de intensidade emocional normalizada 0–1. */
function exclamationIntensity(text: string): number {
  const n = count(text, /!/g);
  return Math.min(1, n / 3);
}

/** Detecta padrões de urgência. */
function hasUrgency(text: string): boolean {
  return /\b(atenção|cuidado|urgente|alerta|aviso|imediata?mente|agora mesmo|perigo)\b/i.test(text);
}

/** Detecta conteúdo empático. */
function hasEmpathy(text: string): boolean {
  return /\b(sinto muito|compreendo|entendo|difícil|lamento|condolências|apoio|estou aqui)\b/i.test(text);
}

/** Detecta tom sério/formal. */
function hasSerious(text: string): boolean {
  return /\b(importante|atenção|confirm|protocolo|procedimento|documentação|relatório|análise|resultado)\b/i.test(text);
}

/** Detecta entusiasmo. */
function hasExcitement(text: string): boolean {
  return /\b(incrível|fantástico|excelente|perfeito|ótimo|maravilhoso|sensacional|parabéns|conseguiu|sucesso)\b/i.test(text);
}

/** Detecta curiosidade intelectual. */
function hasCuriosity(text: string): boolean {
  return /\b(interessante|curioso|descoberta|sabia que|você sabia|na verdade|surpreendente|fascinante)\b/i.test(text);
}

/** Detecta tom leve/descontraído. */
function hasPlayfulness(text: string): boolean {
  return /\b(haha|rs|kk|brincadeira|piada|engraçado|divertido|legal|massa|show|top)\b/i.test(text) ||
    count(text, /😄|😂|🎉|🤣|😜|😏/g) > 0;
}

/** Detecta respostas curtas e calorosas (cumprimentos, confirmações). */
function isFriendlyShort(text: string): boolean {
  const words = text.trim().split(/\s+/).length;
  return words <= 15 &&
    /\b(olá|oi|claro|com prazer|aqui estou|pode deixar|prontinho|pronto|feito|ok|certo)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Máquina de estados — suaviza transições abruptas
// ---------------------------------------------------------------------------

let previousEmotion: EmotionTag = 'neutral';

/**
 * Aplica continuidade: amortece apenas transições verdadeiramente abruptas
 * (ex: excited → empathetic direto). De neutral, qualquer emoção é permitida
 * — é a primeira resposta do turno e o conteúdo deve prevalecer.
 */
function smoothTransition(candidate: EmotionTag, candidateIntensity: number): EmotionState {
  // Pares que seriam jarring se acontecessem consecutivamente
  const jarring: Partial<Record<EmotionTag, EmotionTag[]>> = {
    excited:    ['empathetic', 'serious'],
    playful:    ['empathetic', 'urgent'],
    empathetic: ['excited', 'playful'],
  };

  let emotion: EmotionTag = candidate;

  // De neutral (ou mesma emoção), transição direta sempre é ok
  if (previousEmotion !== 'neutral' && previousEmotion !== candidate) {
    if (jarring[previousEmotion]?.includes(candidate)) {
      // Amortece: vai para a primeira compatível do candidato em vez do salto brusco
      const fallback: Record<EmotionTag, EmotionTag> = {
        neutral:    'neutral',
        friendly:   'friendly',
        excited:    'friendly',
        curious:    'curious',
        serious:    'serious',
        empathetic: 'neutral',
        urgent:     'serious',
        playful:    'friendly',
      };
      emotion = fallback[candidate] ?? candidate;
    }
  }

  previousEmotion = emotion;
  return buildState(emotion, candidateIntensity);
}

/** Mapeia emoção + intensidade para os parâmetros concretos. */
function buildState(emotion: EmotionTag, intensity: number): EmotionState {
  const i = Math.min(1, Math.max(0, intensity));

  const profiles: Record<EmotionTag, Omit<EmotionState, 'emotion' | 'intensity'>> = {
    neutral: {
      speakingRate: 1.0,
      pitchShift: 0,
      pauseProfile: 'natural',
      delivery: 'natural',
      style: 0.0,
    },
    friendly: {
      speakingRate: 1.0 + i * 0.05,
      pitchShift: i * 3,
      pauseProfile: 'natural',
      delivery: 'warm',
      style: 0.1 + i * 0.2,
    },
    excited: {
      speakingRate: 1.0 + i * 0.1,
      pitchShift: i * 5,
      pauseProfile: 'expressive',
      delivery: 'enthusiastic',
      style: 0.3 + i * 0.4,
    },
    curious: {
      speakingRate: 0.98,
      pitchShift: i * 2,
      pauseProfile: 'expressive',
      delivery: 'thoughtful',
      style: 0.1 + i * 0.2,
    },
    serious: {
      speakingRate: 0.95,
      pitchShift: -i * 2,
      pauseProfile: 'natural',
      delivery: 'clear',
      style: 0.0,
    },
    empathetic: {
      speakingRate: 0.92,
      pitchShift: -i * 1,
      pauseProfile: 'expressive',
      delivery: 'gentle',
      style: 0.05 + i * 0.15,
    },
    urgent: {
      speakingRate: 1.05 + i * 0.08,
      pitchShift: i * 3,
      pauseProfile: 'minimal',
      delivery: 'direct',
      style: 0.1 + i * 0.2,
    },
    playful: {
      speakingRate: 1.02 + i * 0.08,
      pitchShift: i * 4,
      pauseProfile: 'expressive',
      delivery: 'light',
      style: 0.2 + i * 0.3,
    },
  };

  const p = profiles[emotion];
  return {
    emotion,
    intensity: i,
    speakingRate: parseFloat(p.speakingRate.toFixed(3)),
    pitchShift: parseFloat(p.pitchShift.toFixed(1)),
    pauseProfile: p.pauseProfile,
    delivery: p.delivery,
    style: parseFloat(p.style.toFixed(3)),
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface EmotionContext {
  /** Texto da resposta que será sintetizada. */
  responseText: string;
  /** Última mensagem do usuário, para contexto. */
  userMessage?: string;
  /** Tipo de resposta (ex: 'command_result', 'error', 'chat', 'calendar'). */
  responseType?: string;
}

/**
 * Determina o EmotionState a partir do contexto da resposta.
 * Nunca lança — devolve neutral em caso de falha.
 */
export function detectEmotion(ctx: EmotionContext): EmotionState {
  try {
    return _detect(ctx);
  } catch {
    return neutralState();
  }
}

function _detect(ctx: EmotionContext): EmotionState {
  const { responseText, responseType } = ctx;
  const text = responseText ?? '';

  // Urgência tem prioridade máxima
  if (hasUrgency(text)) {
    return smoothTransition('urgent', 0.7 + exclamationIntensity(text) * 0.3);
  }

  // Empatia — conteúdo sensível
  if (hasEmpathy(text)) {
    return smoothTransition('empathetic', 0.6);
  }

  // Resultado de erro ou tipo negativo
  if (responseType === 'error') {
    return smoothTransition('serious', 0.5);
  }

  // Entusiasmo
  const excl = exclamationIntensity(text);
  if (hasExcitement(text) || excl >= 0.5) {
    return smoothTransition('excited', 0.5 + excl * 0.4);
  }

  // Curiosidade/descoberta
  if (hasCuriosity(text) || isQuestion(text)) {
    return smoothTransition('curious', 0.45);
  }

  // Tom leve
  if (hasPlayfulness(text)) {
    return smoothTransition('playful', 0.5);
  }

  // Respostas curtas e calorosas
  if (isFriendlyShort(text)) {
    return smoothTransition('friendly', 0.4);
  }

  // Conteúdo formal/sério
  if (hasSerious(text)) {
    return smoothTransition('serious', 0.4);
  }

  // Resposta longa e equilibrada → neutro com ligeiro warmth
  return smoothTransition('neutral', 0.3);
}

/** Reseta o estado da máquina de estados (novo turno de conversa). */
export function resetEmotionState(): void {
  previousEmotion = 'neutral';
}
