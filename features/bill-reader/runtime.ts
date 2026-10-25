import { now } from '@core/clock';
import { isDemo } from '@core/config/data-mode';
import type { BillReading, DocumentReader } from '@core/ai/documents';
import { eventBus, type EventBus } from '@core/events/bus';
import { getProviders } from '@core/providers';
import { getBus } from './bus-ref';
import { createBillReaderService, type BillReaderService } from './service';
import { MemoryScanStore } from './store';

/** Module-level wiring: handlers receive no dependencies, so the service is resolved here. */
export interface Overrides {
  documents?: DocumentReader;
  now?: () => Date;
}

let service: BillReaderService | undefined;
let builtWith: EventBus | undefined;
let store: MemoryScanStore | undefined;
let providers: ReturnType<typeof getProviders> | undefined;
let overrides: Overrides = {};
/** sha256 of a demo sample picture -> its canned reading. Filled by demoSeed; empty outside the demo. */
const samples = new Map<string, BillReading>();

export function getStore(): MemoryScanStore {
  // Fail loud: in live mode in-memory data would silently lose real scans on restart.
  if (!isDemo()) throw new Error('bill-reader: no live store yet');
  return (store ??= new MemoryScanStore());
}

export const setSampleReadings = (entries: Record<string, BillReading>) => {
  samples.clear();
  for (const [k, v] of Object.entries(entries)) samples.set(k, v);
};

export function getService(): BillReaderService {
  const bus = getBus() ?? eventBus;
  if (!service || builtWith !== bus) {
    service = createBillReaderService({
      store: getStore(),
      bus,
      documents: () => overrides.documents ?? (providers ??= getProviders()).documents,
      // Canned answers are used while the bill reader's AI is in demo mode. With the real AI on
      // (DATA_MODE_DOCUMENTS=live) the sample pictures go through the model first, like any photo; the canned
      // answer is then only the safety net if the model is down.
      sampleReading: (sha) => samples.get(sha) ?? null,
      preferModel: () => !isDemo('documents'),
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
  samples.clear();
}
