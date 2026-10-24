import type { DemoWorld } from '@core/demo/world';
import { getService, setCaregivers } from './runtime';

/** Tells the feature who Margaret's caregiver is (nothing else is seeded: an alert only exists once she presses). Idempotent. */
export function seedLostButton(world: DemoWorld): void {
  getService(); // make sure the runtime exists
  setCaregivers(world.patient.id, [world.caregiver.id]);
}
