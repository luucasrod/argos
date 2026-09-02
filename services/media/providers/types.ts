export type MediaAction =
  | 'search'
  | 'play'
  | 'pause'
  | 'resume'
  | 'next'
  | 'volume'
  | 'stop';

export interface MediaTarget {
  id: string;
  name: string;
  kind: 'local' | 'device' | 'group';
  roomId?: string;
  /** Identificador físico entendido pelo provider, separado do catálogo/conta. */
  endpointId: string;
  providerId: string;
  online: boolean;
}

export interface MediaItem {
  id: string;
  title: string;
  subtitle?: string;
  mediaType: 'track' | 'album' | 'playlist' | 'station' | 'podcast';
}

export interface MediaPlaybackState {
  targetId: string;
  status: 'idle' | 'playing' | 'paused' | 'stopped';
  item?: MediaItem;
  volume?: number;
}

export interface MediaProvider {
  readonly id: string;
  readonly capabilities: readonly MediaAction[];
  search: (query: string) => Promise<readonly MediaItem[]>;
  play: (item: MediaItem, target: MediaTarget) => Promise<MediaPlaybackState>;
  pause?: (target: MediaTarget) => Promise<MediaPlaybackState>;
  resume?: (target: MediaTarget) => Promise<MediaPlaybackState>;
  next?: (target: MediaTarget) => Promise<MediaPlaybackState>;
  setVolume?: (target: MediaTarget, volume: number) => Promise<MediaPlaybackState>;
  stop?: (target: MediaTarget) => Promise<MediaPlaybackState>;
}

export interface MediaPreferences {
  defaultProviderId?: string;
  defaultTargetId?: string;
  targetByRoomId?: Record<string, string>;
}

export interface MediaResolutionRequest {
  providerId?: string;
  targetId?: string;
  roomId?: string;
}

export interface ResolvedMediaRoute {
  provider: MediaProvider;
  target: MediaTarget;
  reasons: string[];
}
