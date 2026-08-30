export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 10_000,
  timeoutMessage = 'A requisição demorou mais de 10 segundos para responder.'
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
