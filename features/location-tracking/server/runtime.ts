import { supabaseAuthPorts } from '@core/auth/supabase-verifier';
import { isDemo } from '@core/config/data-mode';
import { serviceClient } from '@core/db';
import { profileAccess } from './access';
import { createLocationService, type AccessCheck, type LocationService } from './service';
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
  const readers = new Set<string>(); // key: `${requesterId}:${patientId}`; demo only (filled by demoSeed)
  // Contract reads (lost-button, ...): demo = the seeded demo household; live = the requester's profiles row.
  // The client is created inside the lookup, so a missing key is a denial too (fail closed), never a crash.
  const live = profileAccess((id) => supabaseAuthPorts(serviceClient()).profileFor(id));
  const canRead: AccessCheck = (requesterId, patientId) =>
    isDemo() ? readers.has(`${requesterId}:${patientId}`) : live(requesterId, patientId);
  const service = createLocationService({ store, now, canRead });
  return { store, service, readers };
}

// Real time on purpose (not @core/clock): device readings carry real device time, so staleness and find-session
// expiry must use the same base. On the sped-up demo clock a fresh reading looked old and Find ended in seconds.
let runtime = build(() => new Date());

export const getRuntime = () => runtime;

export function resetRuntime(now: () => Date = () => new Date()) {
  runtime = build(now);
  return runtime;
}

export const readerKey = (requesterId: string, patientId: string) => `${requesterId}:${patientId}`;
