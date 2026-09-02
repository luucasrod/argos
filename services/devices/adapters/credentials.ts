import type { AdapterCredentialStore } from './types';

export interface CredentialStorage {
  read: (provider: string) => Promise<unknown | null>;
  write: (provider: string, credentials: unknown) => Promise<void>;
  remove: (provider: string) => Promise<void>;
}

/** Entrega ao adapter somente o namespace de credenciais do próprio provider. */
export function scopeAdapterCredentials<TCredentials>(
  provider: string,
  storage: CredentialStorage
): AdapterCredentialStore<TCredentials> {
  return {
    provider,
    load: async () => (await storage.read(provider)) as TCredentials | null,
    save: async (credentials) => storage.write(provider, credentials),
    clear: async () => storage.remove(provider),
  };
}

export class InMemoryCredentialStorage implements CredentialStorage {
  private readonly values = new Map<string, unknown>();

  async read(provider: string): Promise<unknown | null> {
    return this.values.get(provider) ?? null;
  }

  async write(provider: string, credentials: unknown): Promise<void> {
    this.values.set(provider, credentials);
  }

  async remove(provider: string): Promise<void> {
    this.values.delete(provider);
  }
}
