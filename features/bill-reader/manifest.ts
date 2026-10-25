import { defineFeature, type RouteContext } from '@core/feature-registry/manifest';
import { setBus } from './bus-ref';
import { MAX_BODY_BYTES } from './constants';
import { scanInput } from './schemas';

type Handler = keyof typeof import('./routes');
// Lazy import keeps server-only code out of the app bundle (manifests are bundled into the app).
const lazy = (name: Handler) => async (c: RouteContext) => (await import('./routes'))[name](c);

/**
 * "Look at a bill": the patient shows a photo of a bill and gets it in very simple words (what it is, how much, pay by).
 * The picture is read once by an AI and thrown away; only the facts are kept for the caregiver. Circle members have no
 * access. Nothing here pays anything.
 */
export default defineFeature({
  name: 'bill-reader',
  enabledByDefault: false,
  routes: [
    {
      method: 'POST',
      path: '/scans',
      access: { roles: ['patient'] },
      input: scanInput,
      maxBodyBytes: MAX_BODY_BYTES,
      handler: lazy('scan'),
    },
    {
      method: 'GET',
      path: '/scans',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('list'),
    },
  ],
  nav: [], // screens are dashboard widgets (ui/index.tsx)
  permissions: ['bill_reader.scan', 'bill_reader.view'],
  events: { emits: ['caregiver.alert'], consumes: [] },
  migrations: ['bill-reader__202610250300_init.sql'],
  register: ({ bus }) => setBus(bus), // synchronous: no race with the first request
  demoSeed: async () => (await import('./demo/seed')).seedBillReader(),
  demoReset: async () => (await import('./runtime')).resetRuntime(),
});
