import { defineFeature, type RouteContext } from '@core/feature-registry/manifest';
import { setBus } from './bus-ref';
import { emptyInput } from './schemas';

type Handler = keyof typeof import('./routes');
// Lazy import keeps server-only code out of the app bundle (manifests are bundled into the app).
const lazy = (name: Handler) => async (c: RouteContext) => (await import('./routes'))[name](c);

/**
 * "I'm lost": the patient presses once, the primary caregiver is pushed until they acknowledge, and sees the last known
 * location through LocationReadContract. Circle members have no access at all.
 */
export default defineFeature({
  name: 'lost-button',
  enabledByDefault: false,
  routes: [
    {
      method: 'POST',
      path: '/alerts',
      access: { roles: ['patient'] },
      input: emptyInput,
      handler: lazy('press'),
    },
    {
      method: 'GET',
      path: '/alerts/active',
      access: { roles: ['patient', 'primary_caregiver'] },
      handler: lazy('active'),
    },
    {
      method: 'POST',
      path: '/alerts/:id/acknowledge',
      access: { roles: ['primary_caregiver'] },
      input: emptyInput,
      handler: lazy('acknowledge'),
    },
    {
      method: 'POST',
      path: '/alerts/:id/resolve',
      access: { roles: ['primary_caregiver'] },
      input: emptyInput,
      handler: lazy('resolve'),
    },
  ],
  nav: [], // added with the UI
  permissions: ['lost_button.press', 'lost_button.respond'],
  events: { emits: ['caregiver.alert'], consumes: [] },
  migrations: ['lost-button__202610241900_init.sql'],
  register: ({ bus }) => setBus(bus), // synchronous: no race with the first request
  demoSeed: async ({ world }) => {
    (await import('./demo')).seedLostButton(world);
  },
});
