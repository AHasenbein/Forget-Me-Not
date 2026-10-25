/**
 * Public surface of scam-call-guard: what a job runner and cross-feature tests may import. Everything else
 * in this folder is internal. The job (about every minute) is: `await getService().sweep()` from ./runtime.
 */
export { PATIENT_COPY, createScamCallGuardService } from './service';
export type { ScamCallGuardService } from './service';
export { MemoryCallStore } from './store';
export { getService } from './runtime';
