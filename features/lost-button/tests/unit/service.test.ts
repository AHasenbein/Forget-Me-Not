import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '@core/events/bus';
import {
  FakeClock,
  createCircleMember,
  createLinkedPair,
  createMockLocation,
  createMockNotifier,
  createPatient,
  createPrimaryCaregiver,
  createUnlinkedUser,
} from '@core/testing';
import type { EventMap } from '@contracts/events';
import {
  ALERT_TTL_MS,
  FAST_PUSHES,
  FAST_REPEAT_MS,
  SLOW_REPEAT_MS,
  repeatDelayMs,
} from '../../constants';
import { createLostButtonService } from '../../service';
import { MemoryAlertStore } from '../../store';

const clock = new FakeClock('2026-01-01T12:00:00Z');
const { patient, caregiver } = createLinkedPair();
const reading = {
  lat: 40.7,
  lng: -74,
  accuracyM: 10,
  recordedAt: '2026-01-01T11:58:00Z',
  source: 'gps' as const,
  stale: false,
};

function setup(
  opts: { caregivers?: string[]; failPush?: boolean; reading?: typeof reading | null } = {},
) {
  const bus = new EventBus();
  const events: EventMap['caregiver.alert'][] = [];
  bus.on('caregiver.alert', (e) => void events.push(e));
  const notifier = createMockNotifier();
  const pushes: { to: string; data?: Record<string, string>; body: string }[] = [];
  const state = { failPush: opts.failPush ?? false, caregivers: opts.caregivers ?? [caregiver.id] };
  const loc = createMockLocation({
    reading: opts.reading === undefined ? reading : opts.reading,
    allow: (id) => id === caregiver.id,
  });
  const svc = createLostButtonService({
    store: new MemoryAlertStore(),
    bus,
    notifier: () => ({
      ...notifier,
      async push(to, m) {
        if (state.failPush) throw new Error('push service down');
        pushes.push({ to, data: m.data, body: m.body });
      },
    }),
    location: () => loc.contract,
    caregiversOf: () => state.caregivers,
    now: clock.now,
  });
  return { svc, events, pushes, state, loc };
}

beforeEach(() => clock.setTime('2026-01-01T12:00:00Z'));

describe('press', () => {
  it('notifies the caregiver at once, emits one urgent alert, and tells the patient', async () => {
    const t = setup();
    const { alert, alreadyActive } = await t.svc.press(patient);
    expect(alreadyActive).toBe(false);
    expect(alert.status).toBe('notified');
    expect(t.pushes).toHaveLength(1);
    expect(t.pushes[0]).toMatchObject({ to: caregiver.id, data: { alertId: alert.id } });
    expect(t.events).toEqual([
      {
        patientId: patient.id,
        source: 'lost-button',
        severity: 'urgent',
        reasonCode: 'patient_lost',
      },
    ]);
  });

  it('puts no name, place or coordinates in the push or the event', async () => {
    const t = setup();
    await t.svc.press(patient);
    const wire = JSON.stringify([t.pushes, t.events]);
    expect(wire).not.toMatch(/40\.7|-74|lat|lng|latitude/i);
  });

  it('is idempotent: repeated and simultaneous taps make one alert, one push, one event', async () => {
    const t = setup();
    const results = await Promise.all([
      t.svc.press(patient),
      t.svc.press(patient),
      t.svc.press(patient),
    ]);
    await t.svc.press(patient);
    expect(new Set(results.map((r) => r.alert.id)).size).toBe(1);
    expect(results.filter((r) => !r.alreadyActive)).toHaveLength(1);
    expect(t.pushes).toHaveLength(1);
    expect(t.events).toHaveLength(1);
  });

  it('succeeds even when the push service is down, and says nobody could be reached', async () => {
    const t = setup({ failPush: true });
    const { alert } = await t.svc.press(patient);
    expect(alert.status).toBe('no_one_reachable');
    expect((await t.svc.active(caregiver)).alert).not.toBeNull(); // the alert still exists
    expect(t.events).toHaveLength(1);
  });

  it('never claims the caregiver was told when there is no caregiver to tell', async () => {
    const t = setup({ caregivers: [] });
    const { alert } = await t.svc.press(patient);
    expect(alert.status).toBe('no_one_reachable');
    expect(t.pushes).toHaveLength(0);
  });

  it('only a linked patient can press', async () => {
    const t = setup();
    await expect(t.svc.press(caregiver)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(t.svc.press(createUnlinkedUser('patient'))).rejects.toMatchObject({
      status: 403,
      code: 'not_linked',
    });
  });

  it('starts a fresh alert after the previous one was resolved', async () => {
    const t = setup();
    const first = await t.svc.press(patient);
    t.svc.resolve(caregiver, first.alert.id);
    const second = await t.svc.press(patient);
    expect(second.alreadyActive).toBe(false);
    expect(second.alert.id).not.toBe(first.alert.id);
    expect(t.pushes).toHaveLength(2);
  });
});

describe('sweep (repeat pushes)', () => {
  it('repeats every 2 minutes at first, then every 10, until someone acknowledges', async () => {
    const t = setup();
    await t.svc.press(patient);
    expect(repeatDelayMs(0)).toBe(FAST_REPEAT_MS);
    clock.advance(FAST_REPEAT_MS - 1);
    await t.svc.sweep();
    expect(t.pushes).toHaveLength(1); // not yet
    clock.advance(1);
    await t.svc.sweep();
    expect(t.pushes).toHaveLength(2);
    await t.svc.sweep(); // idempotent within the same minute
    expect(t.pushes).toHaveLength(2);

    for (let i = 2; i < FAST_PUSHES; i++) {
      clock.advance(FAST_REPEAT_MS);
      await t.svc.sweep();
    }
    expect(t.pushes).toHaveLength(FAST_PUSHES);
    clock.advance(FAST_REPEAT_MS);
    await t.svc.sweep();
    expect(t.pushes).toHaveLength(FAST_PUSHES); // now slower
    clock.advance(SLOW_REPEAT_MS - FAST_REPEAT_MS);
    await t.svc.sweep();
    expect(t.pushes).toHaveLength(FAST_PUSHES + 1);
  });

  it('stops after acknowledge and after resolve', async () => {
    const t = setup();
    const { alert } = await t.svc.press(patient);
    t.svc.acknowledge(caregiver, alert.id);
    clock.advance(FAST_REPEAT_MS * 3);
    await t.svc.sweep();
    expect(t.pushes).toHaveLength(1);

    const t2 = setup();
    const second = await t2.svc.press(patient);
    t2.svc.resolve(caregiver, second.alert.id);
    clock.advance(FAST_REPEAT_MS * 3);
    await t2.svc.sweep();
    expect(t2.pushes).toHaveLength(1);
  });

  it('retries after a failed push and then reports the caregiver as notified', async () => {
    const t = setup({ failPush: true });
    await t.svc.press(patient);
    t.state.failPush = false;
    clock.advance(FAST_REPEAT_MS);
    await t.svc.sweep();
    expect(t.pushes).toHaveLength(1);
    expect((await t.svc.active(patient)).alert).toMatchObject({ status: 'notified' });
  });

  it('looks caregivers up on every attempt: an unlinked caregiver stops, a new one starts', async () => {
    const t = setup();
    await t.svc.press(patient);
    t.state.caregivers = ['new-caregiver'];
    clock.advance(FAST_REPEAT_MS);
    await t.svc.sweep();
    expect(t.pushes.map((p) => p.to)).toEqual([caregiver.id, 'new-caregiver']);
  });

  it('notifies every caregiver, and expires an alert nobody answered after 24 hours', async () => {
    const t = setup({ caregivers: ['c1', 'c2'] });
    const { alert } = await t.svc.press(patient);
    expect(t.pushes.map((p) => p.to)).toEqual(['c1', 'c2']);
    clock.advance(ALERT_TTL_MS);
    expect(await t.svc.sweep()).toEqual({ repeated: 0, expired: 1 });
    expect((await t.svc.active(patient)).alert).toBeNull();
    expect(() => t.svc.acknowledge(caregiver, alert.id)).toThrowError(
      expect.objectContaining({ status: 409, code: 'expired' }),
    );
    expect((await t.svc.press(patient)).alreadyActive).toBe(false); // a new press starts a new alert
  });
});

describe('active', () => {
  it('shows the patient a status only, never a location', async () => {
    const t = setup();
    await t.svc.press(patient);
    const view = await t.svc.active(patient);
    expect(view).not.toHaveProperty('location');
    expect(JSON.stringify(view)).not.toMatch(/40\.7|lat|lng/);
    expect(t.loc.reads).toHaveLength(0);
  });

  it('shows the caregiver the alert with the location read through the contract (purpose lost_button)', async () => {
    const t = setup();
    await t.svc.press(patient);
    const view = await t.svc.active(caregiver);
    expect(view.location).toMatchObject({ lat: 40.7, stale: false });
    expect(t.loc.reads).toEqual([{ requesterId: caregiver.id, purpose: 'lost_button' }]);
  });

  it('still shows the alert when the location is missing or stale', async () => {
    const none = setup({ reading: null });
    await none.svc.press(patient);
    expect(await none.svc.active(caregiver)).toMatchObject({
      alert: { status: 'active' },
      location: null,
    });

    const old = setup({ reading: { ...reading, stale: true } });
    await old.svc.press(patient);
    expect((await old.svc.active(caregiver)).location).toMatchObject({ stale: true });
  });

  it('returns nothing when there is no open alert', async () => {
    const t = setup();
    expect(await t.svc.active(caregiver)).toEqual({ alert: null, location: null });
    expect(await t.svc.active(patient)).toEqual({ alert: null });
  });
});

describe('acknowledge and resolve', () => {
  it('acknowledge tells the patient help is on the way, and is idempotent', async () => {
    const t = setup();
    const { alert } = await t.svc.press(patient);
    const a = t.svc.acknowledge(caregiver, alert.id);
    expect(a.acknowledgedBy).toBe(caregiver.id);
    clock.advance(1000);
    expect(t.svc.acknowledge(createPrimaryCaregiver(patient), alert.id).acknowledgedBy).toBe(
      caregiver.id,
    );
    expect((await t.svc.active(patient)).alert).toMatchObject({ status: 'on_the_way' });
  });

  it('a patient press while help is on the way returns the same alert', async () => {
    const t = setup();
    const { alert } = await t.svc.press(patient);
    t.svc.acknowledge(caregiver, alert.id);
    const again = await t.svc.press(patient);
    expect(again).toMatchObject({
      alreadyActive: true,
      alert: { id: alert.id, status: 'on_the_way' },
    });
    expect(t.pushes).toHaveLength(1);
  });

  it('resolve closes the alert and cannot be re-acknowledged', async () => {
    const t = setup();
    const { alert } = await t.svc.press(patient);
    t.svc.resolve(caregiver, alert.id);
    expect((await t.svc.active(caregiver)).alert).toBeNull();
    expect(() => t.svc.acknowledge(caregiver, alert.id)).toThrowError(
      expect.objectContaining({ status: 409, code: 'resolved' }),
    );
  });

  it('the patient cannot acknowledge or resolve (nor cancel) an alert', async () => {
    const t = setup();
    const { alert } = await t.svc.press(patient);
    for (const fn of [t.svc.acknowledge, t.svc.resolve])
      expect(() => fn(patient, alert.id)).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('circle members cannot act, even with every grant', async () => {
    const t = setup();
    const { alert } = await t.svc.press(patient);
    const daughter = createCircleMember(patient, { locationGrant: true });
    expect(() => t.svc.acknowledge(daughter, alert.id)).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    await expect(t.svc.active(daughter)).rejects.toMatchObject({ status: 403 });
    await expect(t.svc.press(daughter)).rejects.toMatchObject({ status: 403 });
  });

  it("another patient's caregiver gets 404 and sees nothing of this patient", async () => {
    const t = setup();
    const { alert } = await t.svc.press(patient);
    const stranger = createPrimaryCaregiver(createPatient());
    expect(() => t.svc.acknowledge(stranger, alert.id)).toThrowError(
      expect.objectContaining({ status: 404 }),
    );
    expect(() => t.svc.resolve(stranger, 'no-such-id')).toThrowError(
      expect.objectContaining({ status: 404 }),
    );
    expect(await t.svc.active(stranger)).toEqual({ alert: null, location: null });
    expect(t.loc.reads).toHaveLength(0);
  });

  it('an unlinked caregiver is refused', async () => {
    const t = setup();
    await expect(t.svc.active(createUnlinkedUser('primary_caregiver'))).rejects.toMatchObject({
      status: 403,
      code: 'not_linked',
    });
  });
});
