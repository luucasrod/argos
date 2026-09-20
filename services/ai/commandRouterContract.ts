import type { Device } from '@/types/device.types';
import {
  __resetCommandExecutionIdempotencyForTest,
  claimCommandExecution,
  hasClaimedCommandExecution,
} from './commandExecutionIdempotency';
import { createCommandRouter } from './commandRouter';

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
  __resetCommandExecutionIdempotencyForTest();
  const devices = [device('luz-sala', 'online')];
  const router = createCommandRouter(() => devices);

  const handled = await router.route('apaga as luzes', 'cmd-001');
  assert(handled.handled === true, 'comando fast-path reconhecido deve ser handled');
  assert(handled.handled === true && handled.commandId === 'cmd-001', 'deve devolver o mesmo commandId recebido');
  assert(
    handled.handled === true && handled.intent.type === 'device_control' && handled.intent.actions?.length === 1,
    'deve devolver o ParsedIntent executavel do fast path'
  );
  assert(!hasClaimedCommandExecution('cmd-001'), 'rotear nao deve marcar commandId como executado');
  assert(claimCommandExecution(handled.commandId), 'primeira execucao do commandId deve ser aceita');

  const unhandled = await router.route('conta uma piada', 'cmd-002');
  assert(unhandled.handled === false, 'comando que matchFastDeviceCommand rejeita deve voltar handled:false');

  const sameCommandRoutedAgain = await router.route('apaga as luzes', 'cmd-001');
  assert(
    sameCommandRoutedAgain.handled === false,
    'router deve consultar idempotencia compartilhada quando o commandId ja foi executado'
  );

  const newCommandSameUtterance = await router.route('apaga as luzes', 'cmd-003');
  assert(
    newCommandSameUtterance.handled === true,
    'a mesma frase com commandId novo deve ser tratada como pedido novo, nao duplicata'
  );
  assert(
    newCommandSameUtterance.handled === true && claimCommandExecution(newCommandSameUtterance.commandId),
    'commandId novo deve poder ser executado'
  );

  return [
    'fast-path-handled-with-intent',
    'fast-path-rejected',
    'duplicate-command-id-blocked-at-execution',
    'new-command-id-allowed',
  ];
}
