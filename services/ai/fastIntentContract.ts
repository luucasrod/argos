import type { Device } from '@/types/device.types';
import { matchFastDeviceCommand } from './fastIntent';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fast intent contract: ${message}`);
}

function device(
  id: string,
  category: Device['category'],
  status: Device['status'],
  room: string
): Device {
  return {
    id,
    name: id,
    category,
    icon: '',
    status,
    isOn: true,
    state: { isOn: true },
    room,
    brand: 'contract',
    capabilities: [{ type: 'toggle', property: 'isOn', label: 'Ligado' }],
  };
}

export function runFastIntentContract(): string[] {
  const devices = [
    device('luz-sala', 'lights', 'online', 'Sala'),
    device('luz-quarto', 'lights', 'offline', 'Quarto'),
    device('tv-sala', 'tv', 'online', 'Sala'),
    device('tomada', 'outlets', 'online', 'Sala'),
  ];

  const allLights = matchFastDeviceCommand('apaga as luzes', devices);
  assert(allLights?.actions?.length === 1, 'deve tentar somente luzes acessiveis');
  assert(allLights.actions[0].deviceId === 'luz-sala', 'deve selecionar a luz online');

  const roomLights = matchFastDeviceCommand('apaga as luzes do quarto', devices);
  assert(roomLights === null, 'nao deve prometer acao quando o comodo nao tem luz acessivel');

  const bedtime = matchFastDeviceCommand('boa noite', devices);
  assert(bedtime?.actions?.length === 2, 'boa noite deve apagar luzes e desligar TVs acessiveis');
  assert(
    bedtime.actions.every((action) => action.action === 'setOff'),
    'boa noite deve gerar somente acoes reais de desligar'
  );

  const compound = matchFastDeviceCommand('desliga a tv e apaga as luzes', devices);
  assert(compound === null, 'comando composto desconhecido deve continuar indo para a IA');

  return ['all-lights', 'room-filter', 'bedtime', 'compound-fallback'];
}
