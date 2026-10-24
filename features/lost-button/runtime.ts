import { isDemo } from '@core/config/data-mode';
import { eventBus, type EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { getProviders } from '@core/providers';
import type { LocationReadContract } from '@contracts/location';
import { getBus } from './bus-ref';
import { createLostButtonService, type LostButtonService } from './service';
import { MemoryAlertStore } from './store';

/** Module-level wiring: handlers receive no dependencies, so the service is resolved here. */
export interface Overrides {
  notifier?: Notifier;
  location?: LocationReadContract;
  now?: () => Date;
}

let service: LostButtonService | undefined;
let builtWith: EventBus | undefined;
let store: MemoryAlertStore | undefined;
let providers: ReturnType<typeof getProviders> | undefined;
let overrides: Overrides = {};
const caregivers = new Map<string, string[]>(); // patientId -> caregiver ids (demo only; see demo.ts)

function assertDemo(what: string) {
  // Fail loud: in live mode in-memory data would silently lose real alerts (or notify nobody) on restart.
  if (!isDemo()) throw new Error(`lost-button: no live ${what} yet`);
}

export function getStore(): MemoryAlertStore {
  assertDemo('store');
  return (store ??= new MemoryAlertStore());
}

export function setCaregivers(patientId: string, ids: string[]) {
  caregivers.set(patientId, ids);
}

export function getService(): LostButtonService {
  const bus = getBus() ?? eventBus;
  if (!service || builtWith !== bus) {
    service = createLostButtonService({
      store: getStore(),
      bus,
      notifier: () => overrides.notifier ?? (providers ??= getProviders()).notifier,
      location: () => overrides.location ?? (providers ??= getProviders()).location,
      caregiversOf: (patientId) => {
        assertDemo('caregiver lookup');
        return caregivers.get(patientId) ?? [];
      },
      now: () => (overrides.now ?? (() => new Date()))(),
    });
    builtWith = bus;
  }
  return service;
}

/** Tests only. */
export function resetRuntime(next: Overrides = {}) {
  service = store = providers = builtWith = undefined;
  overrides = next;
  caregivers.clear();
}
