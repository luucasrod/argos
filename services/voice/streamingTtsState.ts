/**
 * streamingTtsState.ts — coordena o streaming de TTS com o speak() normal.
 *
 * Quando o streaming de LLM toca o campo `speech` chunk a chunk, este módulo
 * registra o texto completo e uma promise de conclusão. Quando speak() for
 * chamado com o mesmo texto (pelo processIntent), ele simplesmente aguarda
 * o áudio já em andamento terminar em vez de re-sintetizar do zero.
 */

interface StreamingState {
  id: number;
  text: string;
  completed: Promise<void>;
  stop: () => Promise<void>;
}

let active: StreamingState | null = null;
let nextId = 0;

/** Registra que o streaming TTS está tocando `text`. `stop` é chamado pelo barge-in. */
export function registerStreamingTts(
  text: string,
  completed: Promise<void>,
  stop: () => Promise<void>
): void {
  const id = ++nextId;
  active = { id, text: text.trim(), completed, stop };
  // Usa o ID único para não apagar um registro mais recente com o mesmo texto
  completed.finally(() => {
    if (active?.id === id) active = null;
  });
}

/**
 * Se `text` está sendo tocado via streaming, retorna a promise de conclusão e
 * consome o registro (one-shot). Retorna null se não há streaming para esse texto.
 */
export function consumeStreamingTts(text: string): Promise<void> | null {
  if (!active) return null;
  if (active.text !== text.trim()) return null;
  const p = active.completed;
  active = null;
  return p;
}

/** Cancela qualquer streaming ativo (ex.: barge-in) e para o áudio imediatamente. */
export async function cancelStreamingTtsState(): Promise<void> {
  if (!active) return;
  const fn = active.stop;
  active = null;
  try {
    await fn();
  } catch {}
}

/** true se há streaming TTS ativo agora. */
export function isStreamingTtsActive(): boolean {
  return active !== null;
}
