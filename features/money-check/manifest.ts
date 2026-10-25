import { defineFeature, type RouteContext } from '@core/feature-registry/manifest';
import { setBus } from './bus-ref';
import { createInput, decideInput } from './schemas';

type Handler = keyof typeof import('./routes');
// Lazy import keeps server-only code out of the app bundle (manifests are bundled into the app).
const lazy = (name: Handler) => async (c: RouteContext) => (await import('./routes'))[name](c);

/**
 * "Check before you pay": before paying anything, the patient asks. Plain rules turn that into a verdict with reasons,
 * and only the primary caregiver can say "go ahead". No answer in time means "don't pay". Circle members have no
 * access at all. Nothing here moves money.
 */
export default defineFeature({
  name: 'money-check',
  enabledByDefault: false,
  routes: [
    {
      method: 'POST',
      path: '/requests',
      access: { roles: ['patient'] },
      input: createInput,
      handler: lazy('create'),
    },
    {
      method: 'GET',
      path: '/requests/active',
      access: { roles: ['patient', 'primary_caregiver'] },
      handler: lazy('active'),
    },
    {
      method: 'POST',
      path: '/requests/:id/decide',
      access: { roles: ['primary_caregiver'] },
      input: decideInput,
      handler: lazy('decide'),
    },
    {
      method: 'GET',
      path: '/audit',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('auditLog'),
    },
  ],
  nav: [], // screens are dashboard widgets (ui/index.tsx)
  permissions: ['money_check.ask', 'money_check.decide'],
  events: { emits: ['caregiver.alert'], consumes: [] },
  migrations: ['money-check__202610250100_init.sql'],
  jobs: [
    {
      name: 'money-check.sweep', // unanswered requests become "don't pay"; ticks faster with the demo clock
      everyMs: 60_000,
      run: async () => void (await import('./runtime')).getService().sweep(),
    },
  ],
  register: ({ bus }) => setBus(bus), // synchronous: no race with the first request
  demoSeed: async ({ world }) => (await import('./demo')).seedMoneyCheck(world),
  demoReset: async () => {
    const rt = await import('./runtime');
    rt.resetRuntime();
  },
});
