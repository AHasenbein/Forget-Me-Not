import { describe, expect, it } from 'vitest';
import { EventBus } from '@core/events/bus';
import { FakeClock, createLinkedPair, createMockAi, createMockNotifier } from '@core/testing';
import { MemoryCallStore, createScamCallGuardService } from '../../../features/scam-call-guard';

/**
 * scam-call-guard emits an alert that notifications delivers to the caregiver. Features talk only through the bus:
 * a stand-in `notifications` subscriber receives `caregiver.alert` and delivers it, alongside the feature's own push.
 */
describe('scam-call-guard alert reaches the caregiver', () => {
  const clock = new FakeClock('2026-01-01T12:00:00Z');
  const { patient, caregiver } = createLinkedPair();

  it('a gift card scam call produces one urgent caregiver.alert with no call content, and one push', async () => {
    const bus = new EventBus();
    const push = createMockNotifier();
    const received: unknown[] = [];
    bus.on('caregiver.alert', (e) => void received.push(e));
    const svc = createScamCallGuardService({
      store: new MemoryCallStore(),
      bus,
      notifier: () => push,
      ai: () =>
        createMockAi({ text: '{"verdict":"scam","summary":"Gift card ask."}', confidence: 0.95 }),
      recordingEnabled: () => true,
      caregiversOf: () => [caregiver.id],
      now: clock.now,
    });
    const { call } = await svc.start(patient);
    await svc.addSegment(patient, call.id, {
      seq: 0,
      text: 'This is the IRS. Buy gift cards and read me the numbers right now.',
    });

    expect(received).toEqual([
      {
        patientId: patient.id,
        source: 'scam-call-guard',
        severity: 'urgent',
        reasonCode: 'suspected_scam_payment',
      },
    ]);
    expect(push.sent).toEqual([
      { channel: 'push', to: caregiver.id, body: 'Open Forget Me Not now.' },
    ]);
  });
});
