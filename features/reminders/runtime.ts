import { isDemo } from '@core/config/data-mode';
import { eventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { getProviders } from '@core/providers';
import { getBus } from './bus-ref';
import { createReminderService, type ReminderService } from './service';
import { MemoryStore } from './store';

/** Module-level wiring: handlers receive no dependencies, so the service is resolved here. */
let service: ReminderService | undefined;
let builtWith: unknown;
let store: MemoryStore | undefined;
let providers: ReturnType<typeof getProviders> | undefined;

export function getStore(): MemoryStore {
  // Fail loud: in live mode a memory store would silently lose real reminders on restart.
  if (!isDemo()) throw new Error('reminders: no live store yet (Supabase store not implemented)');
  return (store ??= new MemoryStore());
}

const notifier = (): Notifier => (providers ??= getProviders()).notifier;

export function getService(): ReminderService {
  const bus = getBus() ?? eventBus;
  if (!service || builtWith !== bus) {
    service = createReminderService({ store: getStore(), bus, notifier, now: () => new Date() });
    builtWith = bus;
  }
  return service;
}

/** Tests only. */
export function resetRuntime() {
  service = store = providers = builtWith = undefined;
}
