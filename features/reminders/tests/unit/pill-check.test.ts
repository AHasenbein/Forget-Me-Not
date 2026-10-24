import { describe, expect, it } from 'vitest';
import type { EventMap } from '@contracts/events';
import { DEMO_FRAMES } from '@core/demo/sample-frames';
import { EventBus } from '@core/events/bus';
import { HttpError } from '@core/server/errors';
import {
  FakeClock,
  createCircleMember,
  createLinkedPair,
  createMockNotifier,
  createMockVision,
} from '@core/testing';
import { ESCALATE_MIN, FRAME_RETENTION_DAYS, createReminderService } from '../../service';
import { MemoryStore } from '../../store';
import type { CreateScheduleInput } from '../../schemas';

const pill: CreateScheduleInput = {
  kind: 'pill',
  localTime: '08:00',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  timeZone: 'America/New_York',
  escalate: true,
};

async function setup() {
  const clock = new FakeClock('2026-06-01T11:58:00Z'); // 08:00 EDT is 12:00Z
  const bus = new EventBus();
  const alerts: EventMap['caregiver.alert'][] = [];
  bus.on('caregiver.alert', (e) => void alerts.push(e));
  const vision = createMockVision();
  const store = new MemoryStore();
  const svc = createReminderService({
    store,
    bus,
    notifier: () => createMockNotifier(),
    vision: () => vision,
    now: clock.now,
  });
  const { patient, caregiver } = createLinkedPair();
  await svc.createSchedule(caregiver, pill);
  clock.advance(3 * 60_000);
  const id = (await svc.today(patient))[0]!.id;
  const code = async (fn: () => unknown) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof HttpError) return `${e.status}:${e.code}`;
      throw e;
    }
    return 'ok';
  };
  const confirmed = async () => void (await svc.confirm(patient, id));
  const verification = async () => (await store.getOccurrence(id))!.confirmation?.verification;
  return {
    svc,
    store,
    clock,
    vision,
    alerts,
    patient,
    caregiver,
    id,
    code,
    confirmed,
    verification,
  };
}

describe('pill check: outcomes', () => {
  it('a clear check is verified, keeps NO photos and sends no alert', async () => {
    const t = await setup();
    await t.confirmed();
    expect(await t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES)).toEqual({ received: true });
    expect(await t.verification()).toBe('verified');
    expect((await t.store.getOccurrence(t.id))!.confirmation?.method).toBe('video');
    expect(await t.store.getFrames(t.id)).toEqual([]);
    expect(t.alerts).toEqual([]);
    expect(t.vision.calls[0]).toHaveLength(3);
  });

  it('unclear => pending review: photos kept, ONE caregiver alert, the tap still counts', async () => {
    const t = await setup();
    t.vision.result = { verdict: 'unclear', confidence: 0.4 };
    await t.confirmed();
    expect(await t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES)).toEqual({ received: true });
    expect(await t.verification()).toBe('pending_review');
    expect((await t.store.getOccurrence(t.id))!.status).toBe('confirmed');
    expect(await t.store.getFrames(t.id)).toHaveLength(3);
    expect(t.alerts).toEqual([
      {
        patientId: t.patient.id,
        source: 'reminders',
        severity: 'warning',
        reasonCode: 'pill_check_review',
      },
    ]);
  });

  it('not taken => rejected for the caregiver, but the patient gets the identical answer', async () => {
    const t = await setup();
    t.vision.result = { verdict: 'not_taken', confidence: 0.9 };
    await t.confirmed();
    expect(await t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES)).toEqual({ received: true });
    expect(await t.verification()).toBe('rejected');
    expect(t.alerts).toHaveLength(1);
  });

  it('a confident "taken" below the confidence bar still goes to review', async () => {
    const t = await setup();
    t.vision.result = { verdict: 'taken', confidence: 0.5 };
    await t.confirmed();
    await t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES);
    expect(await t.verification()).toBe('pending_review');
  });

  it('a vision outage or garbage output means review, never a missed alert or a blocked patient', async () => {
    const t = await setup();
    t.vision.error = new Error('model down / unparseable');
    await t.confirmed();
    expect(await t.code(() => t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES))).toBe('ok');
    expect(await t.verification()).toBe('pending_review');
    t.clock.advance((ESCALATE_MIN + 5) * 60_000);
    await t.svc.sweep();
    expect(t.alerts.map((a) => a.reasonCode)).toEqual(['pill_check_review']); // no "reminder_missed"
  });
});

describe('pill check: rules', () => {
  it('only after a patient tap, only for pills, only once', async () => {
    const t = await setup();
    expect(await t.code(() => t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES))).toBe(
      '409:not_confirmed',
    );
    await t.confirmed();
    expect(await t.code(() => t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES))).toBe('ok');
    expect(await t.code(() => t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES))).toBe(
      '409:already_checked',
    );
  });

  it('two submissions at once: exactly one counts', async () => {
    const t = await setup();
    t.vision.result = { verdict: 'unclear', confidence: 0.3 };
    await t.confirmed();
    const results = await Promise.all([
      t.code(() => t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES)),
      t.code(() => t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES)),
    ]);
    expect(results.sort()).toEqual(['409:already_checked', 'ok']);
    expect(t.alerts).toHaveLength(1);
  });

  it('refuses a non-pill, and a pill the caregiver confirmed in person', async () => {
    const t = await setup();
    await t.svc.createSchedule(t.caregiver, { ...pill, kind: 'shower', localTime: '08:02' });
    const shower = (await t.svc.today(t.patient)).find((o) => o.kind === 'shower')!;
    await t.svc.confirm(t.patient, shower.id);
    expect(await t.code(() => t.svc.submitPillCheck(t.patient, shower.id, DEMO_FRAMES))).toBe(
      '409:not_a_pill',
    );
    await t.svc.confirm(t.caregiver, t.id); // "I gave it"
    expect(await t.code(() => t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES))).toBe(
      '409:not_applicable',
    );
  });

  it('checks the real bytes: a PNG labelled as JPEG, or a script, is rejected before any model sees it', async () => {
    const t = await setup();
    await t.confirmed();
    const png = DEMO_FRAMES[0]!.data;
    expect(
      await t.code(() =>
        t.svc.submitPillCheck(t.patient, t.id, [{ mediaType: 'image/jpeg', data: png }]),
      ),
    ).toBe('400:bad_image');
    const script = Buffer.from('<script>alert(1)</script>').toString('base64');
    expect(
      await t.code(() =>
        t.svc.submitPillCheck(t.patient, t.id, [{ mediaType: 'image/png', data: script }]),
      ),
    ).toBe('400:bad_image');
    expect(t.vision.calls).toEqual([]);
    expect(await t.verification()).toBe('unverified');
  });

  it("another patient's occurrence is 404; circle members and caregivers can't submit", async () => {
    const t = await setup();
    await t.confirmed();
    const other = createLinkedPair();
    expect(await t.code(() => t.svc.submitPillCheck(other.patient, t.id, DEMO_FRAMES))).toBe(
      '404:not_found',
    );
    expect(await t.code(() => t.svc.submitPillCheck(t.caregiver, t.id, DEMO_FRAMES))).toBe(
      '403:forbidden',
    );
    expect(
      await t.code(() => t.svc.submitPillCheck(createCircleMember(t.patient), t.id, DEMO_FRAMES)),
    ).toBe('403:forbidden');
  });
});

describe('caregiver review, privacy and retention', () => {
  async function pending() {
    const t = await setup();
    t.vision.result = { verdict: 'unclear', confidence: 0.3 };
    await t.confirmed();
    await t.svc.submitPillCheck(t.patient, t.id, DEMO_FRAMES);
    return t;
  }

  it('only the caregiver can view the photos, and every view is audit-logged', async () => {
    const t = await pending();
    const member = createCircleMember(t.patient, { locationGrant: true });
    expect(await t.code(() => t.svc.getFrames(t.patient, t.id))).toBe('403:forbidden');
    expect(await t.code(() => t.svc.getFrames(member, t.id))).toBe('403:forbidden');
    expect(await t.code(() => t.svc.getFrames(createLinkedPair().caregiver, t.id))).toBe(
      '404:not_found',
    );
    const got = await t.svc.getFrames(t.caregiver, t.id);
    expect(got.frames).toHaveLength(3);
    const log = await t.svc.audit(t.caregiver);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorId: t.caregiver.id,
      action: 'pill_frames_viewed',
      occurrenceId: t.id,
    });
    expect(await t.code(() => t.svc.audit(t.patient))).toBe('403:forbidden');
  });

  it('approve => verified, the photos are deleted, review is logged', async () => {
    const t = await pending();
    const v = await t.svc.reviewCheck(t.caregiver, t.id, 'approve');
    expect(v.confirmation).toMatchObject({ verification: 'verified', reviewedBy: t.caregiver.id });
    expect(await t.store.getFrames(t.id)).toEqual([]);
    expect((await t.svc.audit(t.caregiver)).map((a) => a.action)).toContain('pill_check_reviewed');
  });

  it('reject => rejected and the photos stay until the retention window ends', async () => {
    const t = await pending();
    await t.svc.reviewCheck(t.caregiver, t.id, 'reject');
    expect(await t.verification()).toBe('rejected');
    expect(await t.store.getFrames(t.id)).toHaveLength(3);
  });

  it('nothing to review on a verified or unchecked pill; patients cannot review', async () => {
    const t = await setup();
    await t.confirmed();
    expect(await t.code(() => t.svc.reviewCheck(t.caregiver, t.id, 'approve'))).toBe(
      '409:nothing_to_review',
    );
    expect(await t.code(() => t.svc.reviewCheck(t.patient, t.id, 'approve'))).toBe('403:forbidden');
  });

  it('photos are deleted after the retention window', async () => {
    const t = await pending();
    t.clock.advance((FRAME_RETENTION_DAYS - 1) * 86_400_000);
    expect(await t.svc.cleanupFrames()).toBe(0);
    t.clock.advance(2 * 86_400_000);
    expect(await t.svc.cleanupFrames()).toBe(3);
    expect(await t.store.getFrames(t.id)).toEqual([]);
  });
});
