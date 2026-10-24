import { describe, expect, it } from 'vitest';
import { EventBus } from '@core/events/bus';
import {
  FakeClock,
  createCircleMember,
  createLinkedPair,
  createMockNotifier,
  createPrimaryCaregiver,
  createPatient,
} from '@core/testing';
import { createLostButtonService, MemoryAlertStore } from '../../../features/lost-button';
import { createLocationService } from '../../../features/location-tracking/server/service';
import { createMemoryStore } from '../../../features/location-tracking/server/store';

/**
 * lost-button respects location-tracking permissions. R3 reads location ONLY through LocationReadContract, here
 * backed by R2's real service (not a mock), so R2's authorization and audit log are what is actually tested.
 */
describe('lost-button respects location-tracking permissions', () => {
  const clock = new FakeClock('2026-01-01T12:00:00Z');
  const { patient, caregiver } = createLinkedPair();

  function wire(readers: string[]) {
    const locStore = createMemoryStore();
    const location = createLocationService({
      store: locStore,
      now: clock.now,
      canRead: (requesterId, patientId) =>
        patientId === patient.id && readers.includes(requesterId),
    });
    location.ingest(patient, [
      { lat: 40.7, lng: -74, accuracyM: 10, recordedAt: '2026-01-01T11:57:00Z', source: 'gps' },
    ]);
    const push = createMockNotifier();
    const lost = createLostButtonService({
      store: new MemoryAlertStore(),
      bus: new EventBus(),
      notifier: () => push,
      location: () => location.contract,
      caregiversOf: () => [caregiver.id],
      now: clock.now,
    });
    return { lost, locStore, push };
  }

  it('the caregiver sees the real last known position, and R2 audit-logs the lost_button read', async () => {
    const t = wire([caregiver.id]);
    await t.lost.press(patient);
    const seen = await t.lost.active(caregiver);
    expect(seen.location).toMatchObject({ lat: 40.7, stale: false });
    expect(t.locStore.listAudit(patient.id, 5)[0]).toMatchObject({
      requesterId: caregiver.id,
      purpose: 'lost_button',
      outcome: 'served',
    });
  });

  it('without a location grant R3 still shows the alert, but with no coordinates (and the denial is audited)', async () => {
    const t = wire([]);
    await t.lost.press(patient);
    const seen = await t.lost.active(caregiver);
    expect(seen.alert).toMatchObject({ status: 'active' });
    expect(seen.location).toBeNull();
    expect(t.locStore.listAudit(patient.id, 5)[0]).toMatchObject({ outcome: 'denied' });
  });

  it("another patient's caregiver and a circle member never reach this patient's location through R3", async () => {
    const t = wire([caregiver.id]);
    await t.lost.press(patient);
    const stranger = createPrimaryCaregiver(createPatient());
    expect(await t.lost.active(stranger)).toEqual({ alert: null, location: null });
    const daughter = createCircleMember(patient, { locationGrant: true });
    await expect(t.lost.active(daughter)).rejects.toMatchObject({ status: 403 });
    expect(t.locStore.listAudit(patient.id, 5)).toHaveLength(0);
  });

  it('the patient never receives a location from R3', async () => {
    const t = wire([caregiver.id]);
    await t.lost.press(patient);
    expect(await t.lost.active(patient)).not.toHaveProperty('location');
    expect(t.locStore.listAudit(patient.id, 5)).toHaveLength(0);
  });
});
