import { now } from '@core/clock';
import type { DemoWorld } from '@core/demo/world';
import { getService, getStore } from '../runtime';

/** One fictional good-morning note from the caregiver, written 40 minutes ago. Idempotent. */
export function seedGoodNews(world: DemoWorld): void {
  getService(); // make sure the runtime exists
  const store = getStore();
  if (store.get(world.patient.id)) return;
  store.put({
    patientId: world.patient.id,
    text: `Good morning, ${world.profile.firstName}! I'll come by after lunch and we can water the garden together. Love you.`,
    writtenBy: world.caregiver.id,
    writtenAt: new Date(now().getTime() - 40 * 60_000).toISOString(),
  });
}
