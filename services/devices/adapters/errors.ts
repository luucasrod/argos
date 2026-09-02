export type AdapterErrorCode =
  | 'auth'
  | 'offline'
  | 'timeout'
  | 'unsupported'
  | 'rateLimited';

export class AdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export function normalizeAdapterError(
  error: unknown,
  provider: string,
  fallbackCode: AdapterErrorCode = 'offline'
): AdapterError {
  if (error instanceof AdapterError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new AdapterError('timeout', error.message, provider, true, error);
  }
  return new AdapterError(
    fallbackCode,
    error instanceof Error ? error.message : 'Falha desconhecida no adapter',
    provider,
    fallbackCode !== 'auth' && fallbackCode !== 'unsupported',
    error
  );
}
