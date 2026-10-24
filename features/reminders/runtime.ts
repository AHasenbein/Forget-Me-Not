import { now } from '@core/clock';
import { serviceClient } from '@core/db';
import { isDemo } from '@core/config/data-mode';
import { eventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { getProviders } from '@core/providers';
import { getBus } from './bus-ref';
import { createReminderService, type ReminderService } from './service';
import { SupabaseStore } from './supabase-store';
import { MemoryStore, type ReminderStore } from './store';

/** Module-level wiring: handlers receive no dependencies, so the service is resolved here. */
let service: ReminderService | undefined;
let builtWith: unknown;
let store: ReminderStore | undefined;
let providers: ReturnType<typeof getProviders> | undefined;

export function getStore(): ReminderStore {
  // demo: in memory (resets on restart). live: Postgres via the service-role client (server only).
  return (store ??= isDemo() ? new MemoryStore() : new SupabaseStore(serviceClient()));
}

const notifier = (): Notifier => (providers ??= getProviders()).notifier;
const vision = () => (providers ??= getProviders()).vision;

export function getService(): ReminderService {
  const bus = getBus() ?? eventBus;
  if (!service || builtWith !== bus) {
    service = createReminderService({ store: getStore(), bus, notifier, vision, now });
    builtWith = bus;
  }
  return service;
}

/** Tests only. */
export function resetRuntime() {
  service = store = providers = builtWith = undefined;
}
