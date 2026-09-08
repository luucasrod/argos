import type { Device } from '@/types/device.types';
import { createCommandRouter, __resetCommandRouterStateForTest } from './commandRouter';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Command router contract: ${message}`);
}

function device(id: string, status: Device['status']): Device {
  return {
    id,
    name: id,
    category: 'lights',
    icon: '',
    status,
    isOn: true,
    state: { isOn: true },
    room: 'Sala',
    brand: 'contract',
    capabilities: [{ type: 'toggle', property: 'isOn', label: 'Ligado' }],
  };
}

export async function runCommandRouterContract(): Promise<string[]> {
  __resetCommandRouterStateForTest();
  const devices = [device('luz-sala', 'online')];
  const router = createCommandRouter(() => devices);

  const handled = await router.route('apaga as luzes', 'cmd-001');
  assert(handled.handled === true, 'comando fast-path reconhecido deve ser handled');
  assert(handled.handled === true && handled.commandId === 'cmd-001', 'deve devolver o mesmo commandId recebido');

  const unhandled = await router.route('conta uma piada', 'cmd-002');
  assert(unhandled.handled === false, 'comando que matchFastDeviceCommand rejeita deve voltar handled:false');

  const duplicate = await router.route('apaga as luzes', 'cmd-001');
  assert(
    duplicate.handled === false,
    'mesmo commandId de novo (corrida fast-path/LLM em paralelo) nao deve executar duas vezes'
  );

  const newCommandSameUtterance = await router.route('apaga as luzes', 'cmd-003');
  assert(
    newCommandSameUtterance.handled === true,
    'a mesma frase com commandId novo deve ser tratada como pedido novo, nao duplicata'
  );

  return ['fast-path-handled', 'fast-path-rejected', 'duplicate-command-id-blocked', 'new-command-id-allowed'];
}
