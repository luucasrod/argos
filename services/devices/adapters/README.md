# SDK interno de adapters

Cada integração implementa `Adapter<TCredentials>` e fica responsável por traduzir
seu protocolo para `DiscoveredDevice`, `AdapterState` e `AdapterCommand`. O roteador
consome somente o contrato; adicionar um provider não exige alterar regras de comando.

## Exemplo completo

`FakeAdapter` é a implementação de referência. O ciclo de uso é:

```ts
import {
  FakeAdapter,
  InMemoryCredentialStorage,
  runAdapterContract,
  scopeAdapterCredentials,
} from '@/services/devices/adapters';

const adapter = new FakeAdapter();
const storage = new InMemoryCredentialStorage();
const context = {
  credentials: scopeAdapterCredentials<{ token: string }>(adapter.provider, storage),
};

await adapter.pair({ credentials: { token: 'fixture-token' } }, context);
await adapter.connect(context);
const devices = await adapter.listDevices(context);
await adapter.execute({ deviceId: devices[0].id, property: 'isOn', value: true }, context);

await runAdapterContract({ adapter, context, pairCredentials: { token: 'fixture-token' } });
```

Em produção, substitua `InMemoryCredentialStorage` por armazenamento seguro. Passe ao
adapter apenas o resultado de `scopeAdapterCredentials`; isso impede que uma integração
leia credenciais de outro provider. Erros devem ser `AdapterError` com um dos códigos
`auth`, `offline`, `timeout`, `unsupported` ou `rateLimited`.
