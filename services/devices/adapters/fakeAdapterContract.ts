import { runAdapterContract } from './contractSuite';
import { InMemoryCredentialStorage, scopeAdapterCredentials } from './credentials';
import { FakeAdapter, type FakeCredentials } from './fakeAdapter';

/** Executa a suíte de referência sem rede, conta ou dispositivo real. */
export async function runFakeAdapterContract() {
  const adapter = new FakeAdapter();
  const context = {
    credentials: scopeAdapterCredentials<FakeCredentials>(
      adapter.provider,
      new InMemoryCredentialStorage()
    ),
  };

  return runAdapterContract({
    adapter,
    context,
    pairCredentials: { token: 'contract-fixture' },
  });
}
