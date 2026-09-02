import type { Automation } from '@/types/automation.types';
import { findMatchingAutomations, type TriggerLocation } from './triggerEvaluator';

export interface AutomationSchedulerDependencies {
  getAutomations: () => readonly Automation[];
  runAutomation: (automation: Automation) => Promise<void>;
  onTriggered?: (automation: Automation, triggeredAt: Date) => void;
  getLocation?: () => Promise<TriggerLocation | null>;
  now?: () => Date;
}

export interface AutomationSchedulerOptions {
  intervalMs?: number;
}

export class AutomationTriggerScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly executionKeys = new Set<string>();
  private readonly locationInside = new Map<string, boolean>();
  private ticking = false;

  constructor(
    private readonly dependencies: AutomationSchedulerDependencies,
    private readonly options: AutomationSchedulerOptions = {}
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs ?? 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<Automation[]> {
    if (this.ticking) return [];
    this.ticking = true;
    try {
      const now = this.dependencies.now?.() ?? new Date();
      const automations = [...this.dependencies.getAutomations()];
      const scheduled = automations.filter((automation) =>
        automation.trigger.type === 'time' || automation.trigger.type === 'location'
      );
      const needsLocation = scheduled.some((automation) =>
        automation.isActive && automation.trigger.type === 'location'
      );
      let location: TriggerLocation | undefined;
      if (needsLocation && this.dependencies.getLocation) {
        try {
          location = await this.dependencies.getLocation() ?? undefined;
        } catch (error) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('[argos-automation] falha ao obter localização foreground', error);
          }
        }
      }

      const matches = findMatchingAutomations(scheduled, { now, location });
      const previousLocationInside = new Map(this.locationInside);
      this.recordLocationStates(scheduled, location);
      const toRun = matches.filter((automation) =>
        this.shouldRun(automation, now, previousLocationInside)
      );
      for (const automation of toRun) {
        await this.dependencies.runAutomation(automation);
        this.dependencies.onTriggered?.(automation, now);
      }
      this.pruneExecutionKeys(now);
      return toRun;
    } finally {
      this.ticking = false;
    }
  }

  private shouldRun(
    automation: Automation,
    now: Date,
    previousLocationInside: ReadonlyMap<string, boolean>
  ): boolean {
    if (automation.trigger.type === 'location') {
      return previousLocationInside.get(automation.id) !== true;
    }
    const lastTriggered = automation.lastTriggered
      ? new Date(automation.lastTriggered).getTime()
      : Number.NaN;
    if (Number.isFinite(lastTriggered)) {
      const last = new Date(lastTriggered);
      if (
        last.getFullYear() === now.getFullYear() &&
        last.getMonth() === now.getMonth() &&
        last.getDate() === now.getDate() &&
        last.getHours() === now.getHours() &&
        last.getMinutes() === now.getMinutes()
      ) return false;
    }
    const minute = [
      now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(),
    ].join('-');
    const key = `${automation.id}:${minute}`;
    if (this.executionKeys.has(key)) return false;
    this.executionKeys.add(key);
    return true;
  }

  /** Registra saída de geofence mesmo quando ela não está entre os matches. */
  recordLocationStates(automations: readonly Automation[], location?: TriggerLocation): void {
    if (!location) return;
    for (const automation of automations) {
      if (automation.trigger.type !== 'location') continue;
      const matches = findMatchingAutomations([automation], { location });
      this.locationInside.set(automation.id, matches.length > 0);
    }
  }

  private pruneExecutionKeys(now: Date): void {
    if (this.executionKeys.size < 500) return;
    const currentPrefix = [
      now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(),
    ].join('-');
    for (const key of this.executionKeys) {
      if (!key.endsWith(currentPrefix)) this.executionKeys.delete(key);
    }
  }
}
