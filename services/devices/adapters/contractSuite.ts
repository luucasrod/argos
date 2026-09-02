import { AdapterError } from './errors';
import type { Adapter, AdapterContext } from './types';

export interface AdapterContractFixture<TCredentials> {
  adapter: Adapter<TCredentials>;
  context: AdapterContext<TCredentials>;
  pairCredentials: Record<string, unknown>;
}

export interface AdapterContractReport {
  provider: string;
  checks: string[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Adapter contract: ${message}`);
}

/** Suíte sem dependência de runner; pode ser chamada por qualquer teste ou CI. */
export async function runAdapterContract<TCredentials>(
  fixture: AdapterContractFixture<TCredentials>
): Promise<AdapterContractReport> {
  const { adapter, context } = fixture;
  const checks: string[] = [];

  assert(adapter.provider.trim().length > 0, 'provider deve ser estável e não vazio');
  assert(context.credentials.provider === adapter.provider, 'credenciais devem estar escopadas');
  checks.push('identity');

  await adapter.pair({ credentials: fixture.pairCredentials }, context);
  await adapter.connect(context);
  const health = await adapter.health(context);
  assert(health.ok && health.connected, 'health deve confirmar conexão após pair/connect');
  checks.push('pair-connect-health');

  const discovered = await adapter.discover(context);
  const listed = await adapter.listDevices(context);
  assert(discovered.length > 0, 'discover deve retornar ao menos um dispositivo da fixture');
  assert(listed.length === discovered.length, 'listDevices deve refletir o discovery');
  assert(
    discovered.every((device) => device.provider === adapter.provider),
    'todo dispositivo deve declarar o provider do adapter'
  );
  checks.push('discovery-list');

  const device = discovered[0];
  const before = await adapter.getState(device.id, context);
  const property = device.capabilities.find((capability) => capability.type === 'toggle')?.property;
  assert(property, 'fixture deve expor uma capability toggle executável');
  const result = await adapter.execute({ deviceId: device.id, property, value: true }, context);
  assert(before.deviceId === device.id, 'getState deve preservar deviceId');
  assert(result.state.values[property] === true, 'execute deve devolver o estado resultante');
  checks.push('state-execute');

  try {
    await adapter.execute({ deviceId: device.id, property: '__unsupported__', value: true }, context);
    throw new Error('Adapter contract: execute deveria rejeitar propriedade não suportada');
  } catch (error) {
    assert(
      error instanceof AdapterError && error.code === 'unsupported',
      'operações não suportadas devem usar AdapterError(unsupported)'
    );
  }
  checks.push('standard-errors');

  return { provider: adapter.provider, checks };
}
