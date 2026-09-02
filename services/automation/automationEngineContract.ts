import type { Automation, AutomationTrigger } from '@/types/automation.types';
import { AutomationTriggerScheduler } from './triggerScheduler';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Automation engine contract: ${message}`);
}

function automation(
  id: string,
  trigger: AutomationTrigger,
  isActive = true
): Automation {
  return {
    id,
    name: id,
    description: 'Fixture de contrato',
    emoji: 'test',
    isActive,
    isPreset: false,
    trigger,
    actions: [],
    createdAt: new Date('2026-09-02T10:00:00.000Z'),
    runCount: 0,
    createdBy: 'user',
  };
}

export async function runAutomationEngineContract() {
  const now = new Date(2026, 8, 2, 14, 37, 0);
  const home = { latitude: 38.7223, longitude: -9.1393 };
  const executions: string[] = [];
  let location = { latitude: 38.8, longitude: -9.2 };
  const automations = [
    automation('time-now', {
      type: 'time', config: { time: '14:37' }, label: 'Agora',
    }),
    automation('time-later', {
      type: 'time', config: { time: '14:38' }, label: 'Depois',
    }),
    automation('location-home', {
      type: 'location', config: { ...home, radiusMeters: 100 }, label: 'Cheguei em casa',
    }),
    automation('inactive-now', {
      type: 'time', config: { time: '14:37' }, label: 'Desativada',
    }, false),
  ];
  const scheduler = new AutomationTriggerScheduler({
    getAutomations: () => automations,
    runAutomation: async (item) => { executions.push(item.id); },
    getLocation: async () => location,
    now: () => now,
  });

  const far = await scheduler.tick();
  assert(far.some((item) => item.id === 'time-now'), 'horário atual dispara');
  assert(!far.some((item) => item.id === 'time-later'), 'horário diferente não dispara');
  assert(!far.some((item) => item.id === 'location-home'), 'localização distante não dispara');
  assert(!far.some((item) => item.id === 'inactive-now'), 'automação desativada não dispara');

  location = { latitude: 38.72231, longitude: -9.13931 };
  const near = await scheduler.tick();
  assert(near.some((item) => item.id === 'location-home'), 'entrada no raio dispara');
  assert(
    executions.filter((id) => id === 'time-now').length === 1,
    'checagens repetidas no mesmo minuto não duplicam horário'
  );

  const stillNear = await scheduler.tick();
  assert(!stillNear.some((item) => item.id === 'location-home'), 'permanecer no raio não redispara');

  return [
    'time-match',
    'time-no-match',
    'location-far',
    'location-arrival',
    'inactive',
    'minute-deduplication',
    'location-transition-deduplication',
  ];
}
