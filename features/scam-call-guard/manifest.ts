import { defineFeature, type RouteContext } from '@core/feature-registry/manifest';
import { setBus } from './bus-ref';
import { emptyInput, reviewInput, segmentInput, startInput } from './schemas';

type Handler = keyof typeof import('./routes');
// Lazy import keeps server-only code out of the app bundle (manifests are bundled into the app).
const lazy = (name: Handler) => async (c: RouteContext) => (await import('./routes'))[name](c);

/**
 * Scam-call guard: the phone transcribes a call (client-side speech-to-text) and streams text segments here; rules plus
 * an AI check warn the patient with fixed copy and send the caregiver an overview. Circle members have no access.
 * Starting a call session is refused unless CALL_RECORDING_ENABLED=true (consent/jurisdiction flag).
 */
export default defineFeature({
  name: 'scam-call-guard',
  enabledByDefault: false,
  routes: [
    {
      method: 'POST',
      path: '/calls',
      access: { roles: ['patient'] },
      input: startInput,
      handler: lazy('start'),
    },
    {
      method: 'POST',
      path: '/calls/:id/segments',
      access: { roles: ['patient'] },
      input: segmentInput,
      handler: lazy('segment'),
    },
    {
      method: 'POST',
      path: '/calls/:id/end',
      access: { roles: ['patient'] },
      input: emptyInput,
      handler: lazy('end'),
    },
    {
      method: 'GET',
      path: '/calls',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('list'),
    },
    {
      method: 'GET',
      path: '/calls/:id',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('detail'),
    },
    {
      method: 'POST',
      path: '/calls/:id/review',
      access: { roles: ['primary_caregiver'] },
      input: reviewInput,
      handler: lazy('review'),
    },
    {
      method: 'GET',
      path: '/views',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('views'),
    },
  ],
  nav: [], // widgets live in ui/index.tsx
  jobs: [
    {
      name: 'scam-call-guard-sweep',
      everyMs: 60_000,
      run: async () => void (await (await import('./runtime')).getService().sweep()),
    },
  ],
  permissions: ['scam_call_guard.listen', 'scam_call_guard.review'],
  events: { emits: ['caregiver.alert'], consumes: [] },
  migrations: ['scam-call-guard__202610241930_init.sql'],
  register: ({ bus }) => setBus(bus), // synchronous: no race with the first request
  demoSeed: async ({ world }) => {
    (await import('./demo')).seedScamCallGuard(world);
  },
});
