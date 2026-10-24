import { createLocationService, type LocationService } from './service';
import { createMemoryStore, type LocationStore } from './store';

/**
 * Module-level wiring: route handlers get no injected dependencies from core, so they reach the service here.
 * `resetRuntime` gives tests a clean store and a controllable clock.
 */
interface Runtime {
  store: LocationStore;
  service: LocationService;
  readers: Set<string>;
}

function build(now: () => Date): Runtime {
  const store = createMemoryStore();
  const readers = new Set<string>(); // key: `${requesterId}:${patientId}`
  const service = createLocationService({
    store,
    now,
    canRead: (requesterId, patientId) => readers.has(`${requesterId}:${patientId}`),
  });
  return { store, service, readers };
}

let runtime = build(() => new Date());

export const getRuntime = () => runtime;

export function resetRuntime(now: () => Date = () => new Date()) {
  runtime = build(now);
  return runtime;
}

export const readerKey = (requesterId: string, patientId: string) => `${requesterId}:${patientId}`;
