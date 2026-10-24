import { defineFeature, type RouteContext } from '@core/feature-registry/manifest';
import { setBus } from './bus-ref';
import { createScheduleInput, emptyInput, patchScheduleInput } from './schemas';

type Handler = keyof typeof import('./routes');
// Lazy import keeps server-only code out of the app bundle (manifests are bundled into the app).
const lazy = (name: Handler) => async (c: RouteContext) => (await import('./routes'))[name](c);

/**
 * Reminders: pill, brush teeth, shower, feed pets. Caregiver sets schedules; patient confirms with one
 * tap. Unconfirmed => caregiver.alert. Circle members have no access. Video confirmation of pills is a
 * later step (Confirmation.method 'video' / verification are already modelled).
 */
export default defineFeature({
  name: 'reminders',
  enabledByDefault: false,
  routes: [
    {
      method: 'GET',
      path: '/today',
      access: { roles: ['patient', 'primary_caregiver'] },
      handler: lazy('today'),
    },
    {
      method: 'GET',
      path: '/schedules',
      access: { roles: ['patient', 'primary_caregiver'] },
      handler: lazy('listSchedules'),
    },
    {
      method: 'POST',
      path: '/schedules',
      access: { roles: ['primary_caregiver'] },
      input: createScheduleInput,
      handler: lazy('createSchedule'),
    },
    {
      method: 'PATCH',
      path: '/schedules/:id',
      access: { roles: ['primary_caregiver'] },
      input: patchScheduleInput,
      handler: lazy('updateSchedule'),
    },
    {
      method: 'DELETE',
      path: '/schedules/:id',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('deleteSchedule'),
    },
    {
      method: 'POST',
      path: '/occurrences/:id/confirm',
      access: { roles: ['patient', 'primary_caregiver'] },
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
  nav: [], // added with the UI
  permissions: ['reminders.manage', 'reminders.confirm'],
  events: { emits: ['caregiver.alert'], consumes: [] },
  migrations: [],
  register: ({ bus }) => setBus(bus), // synchronous: no race with the first request
  demoSeed: async ({ world }) => {
    (await import('./demo')).seedReminders(world);
  },
});
