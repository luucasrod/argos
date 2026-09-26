/**
 * ttsPrefetchCache.ts — issue #237. Guarda o áudio (base64) de uma síntese
 * de TTS já em voo, disparada assim que `streamingJsonScanner` extrai o
 * campo `speech` do LLM ainda em streaming — pra quando `speak()` for
 * chamado de verdade (depois da resposta completa + validação de estado dos
 * dispositivos, ver `processIntent` em `hooks/useArgos.ts`), o áudio já
 * esteja pronto ou quase pronto, em vez de começar a rede do zero.
 *
 * Chave: texto exato + opções de voz — um prefetch só é reaproveitado se o
 * `speak()` real pedir o MESMO texto com as MESMAS opções. Qualquer
 * divergência (ex.: o parse final do JSON não bateu com o que foi extraído
 * antecipadamente) simplesmente não encontra a entrada e cai no caminho de
 * sempre — falha aberta, nunca quebra a fala.
 */

type PrefetchOpts = { voice?: string; rate?: number; gender?: 'male' | 'female' };

interface Entry {
  key: string;
  promise: Promise<string>;
  createdAt: number;
}

const TTL_MS = 15_000; // resposta do LLM+TTS não deveria nunca demorar mais que isso
let pending: Entry | null = null;

function makeKey(text: string, opts: PrefetchOpts): string {
  return `${text}|${opts.voice ?? ''}|${opts.rate ?? ''}|${opts.gender ?? ''}`;
}

/** Dispara a síntese em segundo plano e guarda a promise pra reaproveitar depois. */
export function prefetch(text: string, opts: PrefetchOpts, synthesize: () => Promise<string>): void {
  const key = makeKey(text, opts);
  if (pending?.key === key) return; // já em voo, não duplica a chamada
  pending = { key, promise: synthesize(), createdAt: Date.now() };
  // Prefetch nunca deve derrubar nada em segundo plano sem consumidor —
  // um catch silencioso aqui evita "unhandled promise rejection" quando
  // ninguém chega a chamar takeCached() (ex.: usuário cancelou no meio).
  pending.promise.catch(() => {});
}

/** Consome (uma vez) o prefetch se ele bater com o texto/opções pedidos agora. */
export function takeCached(text: string, opts: PrefetchOpts): Promise<string> | null {
  if (!pending) return null;
  const key = makeKey(text, opts);
  if (pending.key !== key) return null;
  if (Date.now() - pending.createdAt > TTL_MS) {
    pending = null;
    return null;
  }
  const { promise } = pending;
  pending = null; // one-shot — próxima fala não reaproveita por engano
  return promise;
}

/**
 * Descarta o prefetch pendente sem consumir — barge-in (#263): o áudio da
 * resposta interrompida não pode tocar depois. A promise em voo já tem
 * catch silencioso (ver `prefetch`), então soltar a referência é seguro.
 */
export function invalidateTtsPrefetch(): void {
  pending = null;
}

/** Só para teste. */
export function __resetTtsPrefetchCacheForTest(): void {
  pending = null;
}
