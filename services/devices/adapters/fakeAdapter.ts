import type { DiscoveredDevice } from '../deviceRegistry';
import { AdapterError } from './errors';
import type {
  Adapter,
  AdapterCommand,
  AdapterContext,
  AdapterState,
  PairRequest,
} from './types';

export interface FakeCredentials {
  token: string;
}

const FAKE_DEVICE_ID = 'fake:light-1';

export class FakeAdapter implements Adapter<FakeCredentials> {
  readonly provider = 'fake';
  private connected = false;
  private state: Record<string, unknown> = { isOn: false, brightness: 50 };

  private async requireCredentials(context: AdapterContext<FakeCredentials>): Promise<void> {
    const credentials = await context.credentials.load();
    if (!credentials?.token) {
      throw new AdapterError('auth', 'Credenciais ausentes', this.provider, false);
    }
  }

  async pair(
    request: PairRequest,
    context: AdapterContext<FakeCredentials>
  ): Promise<{ accountId: string; displayName: string }> {
    const token = request.credentials.token;
    if (typeof token !== 'string' || !token.trim()) {
      throw new AdapterError('auth', 'Token inválido', this.provider, false);
    }
    await context.credentials.save({ token });
    return { accountId: 'fake-account', displayName: 'Conta de teste' };
  }

  async connect(context: AdapterContext<FakeCredentials>): Promise<void> {
    await this.requireCredentials(context);
    this.connected = true;
  }

  async discover(context: AdapterContext<FakeCredentials>): Promise<readonly DiscoveredDevice[]> {
    return this.listDevices(context);
  }

  async listDevices(
    context: AdapterContext<FakeCredentials>
  ): Promise<readonly DiscoveredDevice[]> {
    await this.requireConnected(context);
    return [{
      id: FAKE_DEVICE_ID,
      nativeId: 'light-1',
      provider: this.provider,
      name: 'Luz Fake',
      category: 'lights',
      icon: 'lightbulb',
      status: 'online',
      online: true,
      isOn: this.state.isOn === true,
      capabilities: [
        { type: 'toggle', property: 'isOn', label: 'Ligado' },
        { type: 'range', property: 'brightness', label: 'Brilho', min: 0, max: 100 },
      ],
      state: { ...this.state },
      room: 'Laboratório',
      roomId: 'lab',
      brand: 'Argos',
      aliases: ['luz de teste'],
      metadata: {},
    }];
  }

  async getState(
    deviceId: string,
    context: AdapterContext<FakeCredentials>
  ): Promise<AdapterState> {
    await this.requireConnected(context);
    this.assertDevice(deviceId);
    return this.snapshot();
  }

  async execute(
    command: AdapterCommand,
    context: AdapterContext<FakeCredentials>
  ): Promise<{ deviceId: string; state: AdapterState }> {
    await this.requireConnected(context);
    this.assertDevice(command.deviceId);
    if (!['isOn', 'brightness'].includes(command.property)) {
      throw new AdapterError(
        'unsupported',
        `Propriedade não suportada: ${command.property}`,
        this.provider,
        false
      );
    }
    this.state = { ...this.state, [command.property]: command.value };
    return { deviceId: command.deviceId, state: this.snapshot() };
  }

  async health(context: AdapterContext<FakeCredentials>) {
    const credentials = await context.credentials.load();
    return {
      ok: this.connected && Boolean(credentials?.token),
      connected: this.connected,
      checkedAt: new Date().toISOString(),
      detail: this.connected ? 'FakeAdapter conectado' : 'FakeAdapter desconectado',
    };
  }

  private async requireConnected(context: AdapterContext<FakeCredentials>): Promise<void> {
    await this.requireCredentials(context);
    if (!this.connected) {
      throw new AdapterError('offline', 'Adapter não conectado', this.provider, true);
    }
  }

  private assertDevice(deviceId: string): void {
    if (deviceId !== FAKE_DEVICE_ID) {
      throw new AdapterError('offline', `Dispositivo desconhecido: ${deviceId}`, this.provider, false);
    }
  }

  private snapshot(): AdapterState {
    return {
      deviceId: FAKE_DEVICE_ID,
      online: true,
      values: { ...this.state },
      observedAt: new Date().toISOString(),
    };
  }
}
