import type { DemoWorld } from '@core/demo/world';
import { getService, setCaregivers } from './runtime';

/**
 * Tells the feature who Margaret's caregiver is. Nothing else is seeded: a request only exists once she asks, which
 * is the demo moment ("a caller wants gift cards"). Her unpaid bills come from the shared demo world. Idempotent.
 */
export function seedMoneyCheck(world: DemoWorld): void {
  getService(); // make sure the runtime exists
  setCaregivers(world.patient.id, [world.caregiver.id]);
}
