import type { AiClient } from '@core/ai/client';
import { isDemo } from '@core/config/data-mode';
import { eventBus, type EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { getProviders } from '@core/providers';
import { getBus } from './bus-ref';
import { createScamCallGuardService, type ScamCallGuardService } from './service';
import { MemoryCallStore } from './store';

/** Module-level wiring: handlers receive no dependencies, so the service is resolved here. */
export interface Overrides {
  notifier?: Notifier;
  ai?: AiClient;
  recordingEnabled?: boolean;
  aiTimeoutMs?: number;
  now?: () => Date;
}

let service: ScamCallGuardService | undefined;
let builtWith: EventBus | undefined;
let store: MemoryCallStore | undefined;
let providers: ReturnType<typeof getProviders> | undefined;
let overrides: Overrides = {};
const caregivers = new Map<string, string[]>(); // patientId -> caregiver ids (demo only; see demo.ts)

function assertDemo(what: string) {
  // Fail loud: in live mode in-memory data would silently lose real calls (or notify nobody) on restart.
  if (!isDemo()) throw new Error(`scam-call-guard: no live ${what} yet`);
}

export function getStore(): MemoryCallStore {
  assertDemo('store');
  return (store ??= new MemoryCallStore());
}

export function setCaregivers(patientId: string, ids: string[]) {
  caregivers.set(patientId, ids);
}

export function getService(): ScamCallGuardService {
  const bus = getBus() ?? eventBus;
  if (!service || builtWith !== bus) {
    service = createScamCallGuardService({
      store: getStore(),
      bus,
      notifier: () => overrides.notifier ?? (providers ??= getProviders()).notifier,
      ai: () => overrides.ai ?? (providers ??= getProviders()).ai,
      recordingEnabled: () =>
        overrides.recordingEnabled ?? process.env.CALL_RECORDING_ENABLED === 'true',
      caregiversOf: (patientId) => {
        assertDemo('caregiver lookup');
        return caregivers.get(patientId) ?? [];
      },
      now: () => (overrides.now ?? (() => new Date()))(),
      aiTimeoutMs: overrides.aiTimeoutMs,
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
