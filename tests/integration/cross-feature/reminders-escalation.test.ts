import { describe, expect, it } from 'vitest';
import { EventBus } from '@core/events/bus';
import { FakeClock, createLinkedPair, createMockNotifier, createMockVision } from '@core/testing';
import { ESCALATE_MIN, MemoryStore, createReminderService } from '../../../features/reminders';

/**
 * reminders -> (event bus) -> notifications -> caregiver.
 * The notifications feature does not exist yet, so a stand-in subscriber plays its part: it turns
 * `caregiver.alert` into a push to the patient's caregiver. When notifications lands, replace it.
 */
describe('reminders escalate to the caregiver when unconfirmed', () => {
  it('missed pill => caregiver.alert => caregiver gets a push; confirmed pill => nothing', async () => {
    const clock = new FakeClock('2026-06-01T11:55:00Z');
    const bus = new EventBus();
    const patientPush = createMockNotifier();
    const caregiverPush = createMockNotifier();
    const { patient, caregiver } = createLinkedPair();
    bus.on('caregiver.alert', async (a) => {
      if (a.patientId === patient.id)
        await caregiverPush.push(caregiver.id, { title: 'Alert', body: a.reasonCode });
    });
    const svc = createReminderService({
      store: new MemoryStore(),
      bus,
      notifier: () => patientPush,
      vision: () => createMockVision(),
      now: clock.now,
    });
    await svc.createSchedule(caregiver, {
      kind: 'pill',
      localTime: '08:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      timeZone: 'America/New_York',
      escalate: true,
    });

    clock.advance(5 * 60_000);
    await svc.sweep();
    expect(patientPush.sent).toHaveLength(1); // patient prompted first
    expect(caregiverPush.sent).toHaveLength(0);

    clock.advance(ESCALATE_MIN * 60_000);
    await svc.sweep();
    expect(caregiverPush.sent).toEqual([
      { channel: 'push', to: caregiver.id, body: 'reminder_missed' },
    ]);

    // second patient's miss must not reach this caregiver
    const other = createLinkedPair();
    await bus.emit('caregiver.alert', {
      patientId: other.patient.id,
      source: 'reminders',
      severity: 'urgent',
      reasonCode: 'reminder_missed',
    });
    expect(caregiverPush.sent).toHaveLength(1);
  });
});
