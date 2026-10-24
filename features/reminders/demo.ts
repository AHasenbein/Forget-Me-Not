import type { DemoWorld } from '@core/demo/world';
import { getService, getStore } from './runtime';
import type { Schedule } from './schemas';

/** Canned reminders for Margaret (from the shared demo world + a feature-local shower). Idempotent. */
export function seedReminders(world: DemoWorld): void {
  const store = getStore();
  getService(); // make sure the runtime exists
  const rows: [string, Schedule['kind'], string][] = [
    ...world.reminders.map((r) => [r.id, r.kind, r.time] as [string, Schedule['kind'], string]),
    ['demo-rem-shower', 'shower', '19:00'],
  ];
  for (const [id, kind, localTime] of rows) {
    if (store.getSchedule(`demo-sched-${id}`)) continue;
    store.putSchedule({
      id: `demo-sched-${id}`,
      patientId: world.patient.id,
      kind,
      localTime,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      timeZone: world.profile.timeZone,
      escalate: true,
      paused: false,
      createdBy: world.caregiver.id,
      activeFrom: new Date(world.now.getTime() - 24 * 3_600_000).toISOString(), // today's earlier ones show up
    });
  }
}
