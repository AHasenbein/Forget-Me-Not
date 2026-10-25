import { now } from '@core/clock';
import { isDemo } from '@core/config/data-mode';
import { eventBus, type EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { getProviders } from '@core/providers';
import type { AiClient } from '@core/ai/client';
import type { PlaidPort } from '@core/providers/types';
import { getBus } from './bus-ref';
import { createMoneyCheckService, type MoneyCheckService } from './service';
import { MemoryRequestStore } from './store';

/** Module-level wiring: handlers receive no dependencies, so the service is resolved here. */
export interface Overrides {
  notifier?: Notifier;
  plaid?: PlaidPort;
  ai?: AiClient;
  now?: () => Date;
}

let service: MoneyCheckService | undefined;
let builtWith: EventBus | undefined;
let store: MemoryRequestStore | undefined;
let providers: ReturnType<typeof getProviders> | undefined;
let overrides: Overrides = {};
const caregivers = new Map<string, string[]>(); // patientId -> caregiver ids (demo only; see demo.ts)

function assertDemo(what: string) {
  // Fail loud: in live mode in-memory data would silently lose real requests (or notify nobody) on restart.
  if (!isDemo()) throw new Error(`money-check: no live ${what} yet`);
}

export function getStore(): MemoryRequestStore {
  assertDemo('store');
  return (store ??= new MemoryRequestStore());
}

export function setCaregivers(patientId: string, ids: string[]) {
  caregivers.set(patientId, ids);
}

export function getService(): MoneyCheckService {
  const bus = getBus() ?? eventBus;
  if (!service || builtWith !== bus) {
    service = createMoneyCheckService({
      store: getStore(),
      bus,
      notifier: () => overrides.notifier ?? (providers ??= getProviders()).notifier,
      plaid: () => overrides.plaid ?? (providers ??= getProviders()).plaid,
      ai: () => overrides.ai ?? (providers ??= getProviders()).ai,
      caregiversOf: (patientId) => {
        assertDemo('caregiver lookup');
        return caregivers.get(patientId) ?? [];
      },
      now: () => (overrides.now ?? now)(),
    });
    builtWith = bus;
  }
  return service;
}

/** Demo reset and tests. */
export function resetRuntime(next: Overrides = {}) {
  service = store = providers = builtWith = undefined;
  overrides = next;
  caregivers.clear();
}
