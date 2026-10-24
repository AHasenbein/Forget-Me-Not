import { defineFeature, type RouteContext } from '@core/feature-registry/manifest';
import { setBus } from './bus-ref';
import { createScheduleInput, emptyInput, patchScheduleInput } from './schemas';

type Handler = keyof typeof import('./routes');
// Lazy import keeps server-only code out of the app bundle (manifests are bundled into the app).
const lazy = (name: Handler) => async (c: RouteContext) => (await import('./routes'))[name](c);
const both = { roles: ['patient', 'primary_caregiver'] } as const;
const caregiver = { roles: ['primary_caregiver'] } as const;

/**
 * Reminders: pill, brush teeth, shower, feed pets. Caregiver sets schedules; patient confirms with one
 * tap. Unconfirmed => caregiver.alert. Circle members have no access. Video confirmation of pills is a
 * later step (Confirmation.method 'video' / verification are already modelled).
 */
export default defineFeature({
  name: 'reminders',
  enabledByDefault: false,
  routes: [
    { method: 'GET', path: '/today', access: both, handler: lazy('today') },
    { method: 'GET', path: '/history', access: both, handler: lazy('history') },
    { method: 'GET', path: '/schedules', access: both, handler: lazy('listSchedules') },
    {
      method: 'POST',
      path: '/schedules',
      access: caregiver,
      input: createScheduleInput,
      handler: lazy('createSchedule'),
    },
    {
      method: 'PATCH',
      path: '/schedules/:id',
      access: caregiver,
      input: patchScheduleInput,
      handler: lazy('updateSchedule'),
    },
    {
      method: 'DELETE',
      path: '/schedules/:id',
      access: caregiver,
      handler: lazy('deleteSchedule'),
    },
    {
      method: 'POST',
      path: '/occurrences/:id/confirm',
      access: both,
      input: emptyInput,
      handler: lazy('confirm'),
    },
    {
      method: 'POST',
      path: '/occurrences/:id/snooze',
      access: { roles: ['patient'] },
      input: emptyInput,
      handler: lazy('snooze'),
    },
  ],
  nav: [], // screens are dashboard widgets (ui/index.tsx), not separate routes
  permissions: ['reminders.manage', 'reminders.confirm'],
  events: { emits: ['caregiver.alert'], consumes: [] },
  migrations: [],
  // The clock: prompts the patient and alerts the caregiver. Ticks faster when demo time is sped up.
  jobs: [
    {
      name: 'reminders.sweep',
      everyMs: 60_000,
      run: async () => void (await (await import('./runtime')).getService().sweep()),
    },
  ],
  register: ({ bus }) => setBus(bus), // synchronous: no race with the first request
  demoSeed: async ({ world }) => (await import('./demo')).seedReminders(world),
  demoReset: async () => (await import('./runtime')).resetRuntime(),
});
