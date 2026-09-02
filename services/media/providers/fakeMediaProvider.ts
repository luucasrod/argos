import type {
  MediaItem,
  MediaPlaybackState,
  MediaProvider,
  MediaTarget,
} from './types';

export class FakeMediaProvider implements MediaProvider {
  readonly id = 'fake-media';
  readonly capabilities = [
    'search', 'play', 'pause', 'resume', 'next', 'volume', 'stop',
  ] as const;
  private readonly states = new Map<string, MediaPlaybackState>();
  private readonly catalog: MediaItem[] = [
    { id: 'track-1', title: 'Som de teste', subtitle: 'Argos', mediaType: 'track' },
    { id: 'playlist-1', title: 'Relaxar', subtitle: 'Fixture', mediaType: 'playlist' },
  ];

  async search(query: string): Promise<readonly MediaItem[]> {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return [];
    return this.catalog.filter((item) =>
      `${item.title} ${item.subtitle ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized)
    ).map((item) => ({ ...item }));
  }

  async play(item: MediaItem, target: MediaTarget): Promise<MediaPlaybackState> {
    return this.save(target, { targetId: target.id, status: 'playing', item: { ...item }, volume: 50 });
  }

  async pause(target: MediaTarget): Promise<MediaPlaybackState> {
    return this.patch(target, { status: 'paused' });
  }

  async resume(target: MediaTarget): Promise<MediaPlaybackState> {
    return this.patch(target, { status: 'playing' });
  }

  async next(target: MediaTarget): Promise<MediaPlaybackState> {
    const current = this.requireState(target);
    const currentIndex = this.catalog.findIndex((item) => item.id === current.item?.id);
    return this.save(target, {
      ...current,
      status: 'playing',
      item: { ...this.catalog[(currentIndex + 1) % this.catalog.length] },
    });
  }

  async setVolume(target: MediaTarget, volume: number): Promise<MediaPlaybackState> {
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
      throw new Error('Volume deve estar entre 0 e 100');
    }
    return this.patch(target, { volume });
  }

  async stop(target: MediaTarget): Promise<MediaPlaybackState> {
    return this.patch(target, { status: 'stopped' });
  }

  getState(targetId: string): MediaPlaybackState | null {
    const state = this.states.get(targetId);
    return state ? { ...state, item: state.item ? { ...state.item } : undefined } : null;
  }

  private requireState(target: MediaTarget): MediaPlaybackState {
    const state = this.states.get(target.id);
    if (!state) throw new Error(`Target sem playback: ${target.id}`);
    return state;
  }

  private async patch(
    target: MediaTarget,
    changes: Partial<MediaPlaybackState>
  ): Promise<MediaPlaybackState> {
    return this.save(target, { ...this.requireState(target), ...changes });
  }

  private save(target: MediaTarget, state: MediaPlaybackState): MediaPlaybackState {
    if (target.providerId !== this.id) throw new Error('Target pertence a outro provider');
    const copy = { ...state, item: state.item ? { ...state.item } : undefined };
    this.states.set(target.id, copy);
    return { ...copy, item: copy.item ? { ...copy.item } : undefined };
  }
}
