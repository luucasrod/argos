import type { Automation, AutomationTrigger } from '@/types/automation.types';

export interface TriggerLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface TriggerEvaluationContext extends Record<string, unknown> {
  now?: Date | string | number;
  phrase?: string;
  manual?: boolean;
  location?: TriggerLocation;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, domingo: 0,
  monday: 1, segunda: 1, 'segunda-feira': 1,
  tuesday: 2, terça: 2, terca: 2, 'terça-feira': 2, 'terca-feira': 2,
  wednesday: 3, quarta: 3, 'quarta-feira': 3,
  thursday: 4, quinta: 4, 'quinta-feira': 4,
  friday: 5, sexta: 5, 'sexta-feira': 5,
  saturday: 6, sábado: 6, sabado: 6,
};

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function triggerTime(config: Record<string, unknown>): { hour: number; minute: number } | null {
  if (typeof config.time === 'string') {
    const match = config.time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) return { hour: Number(match[1]), minute: Number(match[2]) };
  }
  const hour = numberFrom(config.hour);
  const minute = numberFrom(config.minute) ?? 0;
  return hour === null ? null : { hour, minute };
}

function matchesWeekday(config: Record<string, unknown>, now: Date): boolean {
  const configured = Array.isArray(config.weekdays)
    ? config.weekdays
    : Array.isArray(config.days) ? config.days : null;
  if (!configured || configured.length === 0) return true;
  return configured.some((day) => {
    if (typeof day === 'number') return day === now.getDay();
    return typeof day === 'string' && WEEKDAYS[day.trim().toLocaleLowerCase('pt-BR')] === now.getDay();
  });
}

function validCoordinates(location: TriggerLocation): boolean {
  return Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
}

/** Distância Haversine em metros. */
export function distanceInMeters(from: TriggerLocation, to: TriggerLocation): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

export function evaluateTrigger(
  trigger: AutomationTrigger,
  context: TriggerEvaluationContext = {}
): boolean {
  switch (trigger.type) {
    case 'voice':
      return (
        typeof context.phrase === 'string' &&
        typeof trigger.config.phrase === 'string' &&
        context.phrase.toLowerCase().includes(String(trigger.config.phrase).toLowerCase())
      );
    case 'manual':
      return context.manual === true;
    case 'time': {
      const scheduled = triggerTime(trigger.config);
      if (!scheduled || scheduled.hour < 0 || scheduled.hour > 23 ||
        scheduled.minute < 0 || scheduled.minute > 59) return false;
      const now = new Date(context.now ?? Date.now());
      if (!Number.isFinite(now.getTime())) return false;
      const date = typeof trigger.config.date === 'string' ? trigger.config.date : null;
      const localDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');
      return (!date || date === localDate) && matchesWeekday(trigger.config, now) &&
        now.getHours() === scheduled.hour && now.getMinutes() === scheduled.minute;
    }
    case 'location': {
      const latitude = numberFrom(trigger.config.latitude ?? trigger.config.lat);
      const longitude = numberFrom(
        trigger.config.longitude ?? trigger.config.lng ?? trigger.config.lon
      );
      const current = context.location;
      if (latitude === null || longitude === null || !current) return false;
      const target = { latitude, longitude };
      if (!validCoordinates(target) || !validCoordinates(current)) return false;
      const configuredRadius = numberFrom(
        trigger.config.radiusMeters ?? trigger.config.radius
      );
      const radius = configuredRadius !== null && configuredRadius > 0 ? configuredRadius : 100;
      return distanceInMeters(current, target) <= radius;
    }
    default:
      return false;
  }
}

export function findMatchingAutomation(
  automations: Automation[],
  context: TriggerEvaluationContext
): Automation | undefined {
  return automations.find((a) => a.isActive && evaluateTrigger(a.trigger, context));
}

export function findMatchingAutomations(
  automations: Automation[],
  context: TriggerEvaluationContext
): Automation[] {
  const remaining = [...automations];
  const matches: Automation[] = [];
  while (remaining.length > 0) {
    const match = findMatchingAutomation(remaining, context);
    if (!match) break;
    matches.push(match);
    remaining.splice(remaining.indexOf(match), 1);
  }
  return matches;
}
