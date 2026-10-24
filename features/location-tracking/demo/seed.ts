import type { DemoWorld } from '@core/demo/world';
import { getRuntime, readerKey } from '../server/runtime';

/** Margaret's last known position plus who may read it. Idempotent; fictional data from DemoWorld only. */
export function seedLocation(world: DemoWorld) {
  const { store, readers } = getRuntime();
  const patientId = world.patient.id;
  const { stale: _stale, ...reading } = world.location.lastKnown;
  store.saveIfNewer(patientId, reading);
  // The friend has no location grant, so is deliberately absent.
  for (const u of [world.patient, world.caregiver, world.daughter])
    readers.add(readerKey(u.id, patientId));
  store.appendAudit({
    id: 'demo-view-1',
    patientId,
    requesterId: world.daughter.id,
    purpose: 'circle_view',
    outcome: 'served',
    at: new Date(world.now.getTime() - 20 * 60_000).toISOString(),
  });
}
