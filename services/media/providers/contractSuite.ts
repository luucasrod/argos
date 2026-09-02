import { FakeMediaProvider } from './fakeMediaProvider';
import { MediaRegistry } from './mediaRegistry';
import type { MediaTarget } from './types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Media provider contract: ${message}`);
}

export async function runMediaProviderContract() {
  const provider = new FakeMediaProvider();
  const target: MediaTarget = {
    id: 'speaker-bedroom',
    name: 'Caixa do quarto',
    kind: 'device',
    roomId: 'bedroom',
    endpointId: 'fake-endpoint-1',
    providerId: provider.id,
    online: true,
  };
  const registry = new MediaRegistry();
  registry.registerProvider(provider);
  registry.registerTarget(target);

  const route = registry.resolve(
    { roomId: 'bedroom' },
    { defaultProviderId: provider.id, targetByRoomId: { bedroom: target.id } }
  );
  assert(route.provider.id === provider.id, 'resolve provider preferido');
  assert(route.target.id === target.id, 'resolve target preferido por cômodo');

  const results = await route.provider.search('teste');
  assert(results.length === 1, 'search consulta catálogo do provider');
  const playing = await route.provider.play(results[0], route.target);
  assert(playing.status === 'playing' && playing.targetId === target.id, 'play usa endpoint alvo');

  const paused = await route.provider.pause?.(route.target);
  assert(paused?.status === 'paused', 'pause funciona quando declarado');
  const resumed = await route.provider.resume?.(route.target);
  assert(resumed?.status === 'playing', 'resume funciona quando declarado');
  const volume = await route.provider.setVolume?.(route.target, 35);
  assert(volume?.volume === 35, 'volume funciona quando declarado');
  const next = await route.provider.next?.(route.target);
  assert(next?.item?.id === 'playlist-1', 'next avança o catálogo');
  const stopped = await route.provider.stop?.(route.target);
  assert(stopped?.status === 'stopped', 'stop funciona quando declarado');

  return ['route-resolution', 'search', 'play', 'pause-resume', 'volume', 'next', 'stop'];
}
