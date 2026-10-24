import type { DemoWorld } from '@core/demo/world';
import { getService, getStore } from './runtime';
import type { Schedule } from './schemas';
import { localTimeOf } from './time';

/**
 * Canned reminders for Margaret. Times are RELATIVE to demo "now" so the demo is walkable immediately:
 * pill in 2 min, then +4 min apart. (Fixed clock times would all be "missed" whenever you start.)
 * `activeFrom = now` so nothing earlier today is generated. Idempotent.
 */
export const DEMO_OFFSETS_MIN = [2, 6, 10, 14];

export async function seedReminders(world: DemoWorld): Promise<void> {
  const store = getStore();
  getService(); // make sure the runtime exists
  const kinds: [string, Schedule['kind']][] = [
    ...world.reminders.map((r) => [r.id, r.kind] as [string, Schedule['kind']]),
    ['demo-rem-shower', 'shower'],
  ];
  for (const [i, [id, kind]] of kinds.entries()) {
    if (await store.getSchedule(`demo-sched-${id}`)) continue;
    const due = new Date(world.now.getTime() + (DEMO_OFFSETS_MIN[i] ?? 20) * 60_000);
    await store.putSchedule({
      id: `demo-sched-${id}`,
      patientId: world.patient.id,
      kind,
      localTime: localTimeOf(due, world.profile.timeZone),
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      timeZone: world.profile.timeZone,
      escalate: true,
      paused: false,
      createdBy: world.caregiver.id,
      activeFrom: world.now.toISOString(),
    });
  }
}
