import type { DiscoveredDevice, DeviceProvider } from '../deviceRegistry';

export interface AdapterContext<TCredentials> {
  credentials: AdapterCredentialStore<TCredentials>;
}

export interface AdapterCredentialStore<TCredentials> {
  readonly provider: DeviceProvider;
  load: () => Promise<TCredentials | null>;
  save: (credentials: TCredentials) => Promise<void>;
  clear: () => Promise<void>;
}

export interface PairRequest {
  credentials: Record<string, unknown>;
}

export interface PairResult {
  accountId?: string;
  displayName?: string;
}

export interface AdapterState {
  deviceId: string;
  online: boolean;
  values: Record<string, unknown>;
  observedAt: string;
}

export interface AdapterCommand {
  deviceId: string;
  property: string;
  value: unknown;
}

export interface AdapterExecutionResult {
  deviceId: string;
  state: AdapterState;
}

export interface AdapterHealth {
  ok: boolean;
  connected: boolean;
  checkedAt: string;
  detail?: string;
}

/** Contrato estável implementado por toda integração de dispositivos. */
export interface Adapter<TCredentials = unknown> {
  readonly provider: DeviceProvider;
  discover: (context: AdapterContext<TCredentials>) => Promise<readonly DiscoveredDevice[]>;
  pair: (
    request: PairRequest,
    context: AdapterContext<TCredentials>
  ) => Promise<PairResult>;
  connect: (context: AdapterContext<TCredentials>) => Promise<void>;
  listDevices: (context: AdapterContext<TCredentials>) => Promise<readonly DiscoveredDevice[]>;
  getState: (
    deviceId: string,
    context: AdapterContext<TCredentials>
  ) => Promise<AdapterState>;
  execute: (
    command: AdapterCommand,
    context: AdapterContext<TCredentials>
  ) => Promise<AdapterExecutionResult>;
  health: (context: AdapterContext<TCredentials>) => Promise<AdapterHealth>;
}
