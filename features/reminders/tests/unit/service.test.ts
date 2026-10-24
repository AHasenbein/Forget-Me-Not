import { beforeEach, describe, expect, it } from 'vitest';
import type { EventMap } from '@contracts/events';
import { EventBus } from '@core/events/bus';
import { HttpError } from '@core/server/errors';
import {
  FakeClock,
  createCircleMember,
  createLinkedPair,
  createMockNotifier,
  createUnlinkedUser,
} from '@core/testing';
import { ESCALATE_MIN, MAX_SNOOZES, createReminderService } from '../../service';
import { MemoryStore } from '../../store';
import type { CreateScheduleInput } from '../../schemas';

const NY = 'America/New_York';
// 2026-06-01 is a Monday; 08:00 EDT = 12:00Z. Start 5 minutes before the first reminder.
const START = '2026-06-01T11:55:00Z';
const pill: CreateScheduleInput = {
  kind: 'pill',
  localTime: '08:00',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  timeZone: NY,
  escalate: true,
};

function setup() {
  const clock = new FakeClock(START);
  const bus = new EventBus();
  const notifier = createMockNotifier();
  const alerts: EventMap['caregiver.alert'][] = [];
  bus.on('caregiver.alert', (e) => void alerts.push(e));
  const svc = createReminderService({
    store: new MemoryStore(),
    bus,
    notifier: () => notifier,
    now: clock.now,
  });
  const { patient, caregiver } = createLinkedPair();
  const min = (n: number) => clock.advance(n * 60_000);
  const code = async (fn: () => unknown) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof HttpError) return `${e.status}:${e.code}`;
      throw e;
    }
    return 'ok';
  };
  const first = async () => (await svc.today(caregiver))[0]!;
  return { svc, clock, notifier, alerts, patient, caregiver, min, code, first };
}

describe('happy path', () => {
  it('caregiver schedules, patient sees today and confirms with one tap', async () => {
    const { svc, patient, caregiver, min, first } = setup();
    await svc.createSchedule(caregiver, pill);
    expect((await first()).phase).toBe('upcoming');
    min(10);
    const o = (await svc.today(patient))[0]!;
    expect(o.phase).toBe('due');
    const res = await svc.confirm(patient, o.id);
    expect(res.alreadyConfirmed).toBe(false);
    expect(res.occurrence.confirmation).toMatchObject({
      method: 'tap',
      verification: 'unverified',
      by: patient.id,
    });
  });

  it('prompts the patient, then again, and sends NO alert when confirmed in time', async () => {
    const { svc, patient, caregiver, notifier, alerts, min, first } = setup();
    await svc.createSchedule(caregiver, pill);
    min(5); // 08:00
    await svc.sweep();
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toMatchObject({ to: patient.id, body: 'Time to take your pill' });
    min(15);
    await svc.sweep();
    expect(notifier.sent).toHaveLength(2);
    await svc.confirm(patient, (await first()).id);
    min(60);
    await svc.sweep();
    expect(alerts).toEqual([]);
  });

  it('works for every reminder kind', async () => {
    const { svc, caregiver } = setup();
    for (const kind of ['pill', 'brush_teeth', 'shower', 'feed_pets'] as const)
      await svc.createSchedule(caregiver, { ...pill, kind, localTime: '09:00' });
    expect(await svc.today(caregiver)).toHaveLength(4);
  });
});

describe('escalation', () => {
  it('alerts the caregiver once, with ids/enums only, when unconfirmed', async () => {
    const { svc, caregiver, patient, alerts, min } = setup();
    await svc.createSchedule(caregiver, pill);
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    await svc.sweep(); // idempotent: no second alert
    expect(alerts).toEqual([
      {
        patientId: patient.id,
        source: 'reminders',
        severity: 'urgent',
        reasonCode: 'reminder_missed',
      },
    ]);
  });

  it('non-pill reminders alert as warning; escalate:false stays silent', async () => {
    const { svc, caregiver, alerts, min } = setup();
    await svc.createSchedule(caregiver, { ...pill, kind: 'feed_pets' });
    await svc.createSchedule(caregiver, { ...pill, kind: 'shower', escalate: false });
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    expect(alerts.map((a) => a.severity)).toEqual(['warning']);
  });

  it('a very late sweep (server was down) still alerts but never prompts the patient', async () => {
    const { svc, caregiver, alerts, notifier, min } = setup();
    await svc.createSchedule(caregiver, pill);
    min(5 + 6 * 60);
    await svc.sweep();
    expect(alerts).toHaveLength(1);
    expect(notifier.sent).toHaveLength(0);
  });

  it('paused schedules (asleep / in hospital) neither prompt nor alert', async () => {
    const { svc, caregiver, alerts, notifier, min } = setup();
    const s = await svc.createSchedule(caregiver, pill);
    await svc.updateSchedule(caregiver, s.id, { paused: true });
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    expect(alerts).toEqual([]);
    expect(notifier.sent).toEqual([]);
  });

  it('a schedule created after its time today does not produce a spurious missed alert', async () => {
    const { svc, caregiver, alerts, min } = setup();
    min(5 + 3 * 60); // 11:00 local
    await svc.createSchedule(caregiver, pill); // 08:00 already passed today
    await svc.sweep();
    expect(await svc.today(caregiver)).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it('confirming on the due day then sweeping later never alerts', async () => {
    const { svc, caregiver, patient, alerts, min, first } = setup();
    await svc.createSchedule(caregiver, pill);
    min(5);
    await svc.confirm(patient, (await first()).id);
    min(24 * 60);
    await svc.sweep();
    expect(alerts).toEqual([]);
  });
});

describe('snooze abuse', () => {
  it('allows at most MAX_SNOOZES, each pushes the alert back, then 409 snooze_limit', async () => {
    const { svc, caregiver, patient, alerts, min, code, first } = setup();
    await svc.createSchedule(caregiver, pill);
    min(5);
    const id = (await first()).id;
    for (let i = 0; i < MAX_SNOOZES; i++)
      expect(await code(async () => svc.snooze(patient, id))).toBe('ok');
    expect(await code(async () => svc.snooze(patient, id))).toBe('409:snooze_limit');
    min(ESCALATE_MIN); // original escalation time has passed, but snoozes extended it
    await svc.sweep();
    expect(alerts).toEqual([]);
    min(MAX_SNOOZES * 10);
    await svc.sweep();
    expect(alerts).toHaveLength(1);
  });

  it('cannot snooze before it is due, after the alert, or as a caregiver', async () => {
    const { svc, caregiver, patient, min, code, first } = setup();
    await svc.createSchedule(caregiver, pill);
    const id = (await first()).id;
    expect(await code(async () => svc.snooze(patient, id))).toBe('409:not_due');
    min(5);
    expect(await code(async () => svc.snooze(caregiver, id))).toBe('403:forbidden');
    min(ESCALATE_MIN);
    expect(await code(async () => svc.snooze(patient, id))).toBe('409:overdue');
  });
});

describe('double-dose risk', () => {
  it('a second tap is idempotent (no second confirmation)', async () => {
    const { svc, caregiver, patient, min, first } = setup();
    await svc.createSchedule(caregiver, pill);
    min(5);
    const id = (await first()).id;
    const a = await svc.confirm(patient, id);
    min(1);
    const b = await svc.confirm(patient, id);
    expect(b.alreadyConfirmed).toBe(true);
    expect(b.occurrence.confirmation).toEqual(a.occurrence.confirmation);
  });

  it('two pill schedules close together: the second confirm is refused (too_soon)', async () => {
    const { svc, caregiver, patient, min, code } = setup();
    await svc.createSchedule(caregiver, pill);
    await svc.createSchedule(caregiver, { ...pill, localTime: '08:30' });
    min(40); // 08:35 local: both due
    const [a, b] = await svc.today(patient);
    expect(await code(async () => svc.confirm(patient, a!.id))).toBe('ok');
    expect(await code(async () => svc.confirm(patient, b!.id))).toBe('409:too_soon');
  });

  it('a pill due right after a confirmed pill is skipped, not prompted', async () => {
    const { svc, caregiver, patient, notifier, min } = setup();
    await svc.createSchedule(caregiver, pill);
    await svc.createSchedule(caregiver, { ...pill, localTime: '08:30' });
    min(5);
    await svc.confirm(patient, (await svc.today(patient))[0]!.id);
    min(30); // 08:30
    await svc.sweep();
    expect((await svc.today(patient))[1]!.phase).toBe('skipped');
    expect(notifier.sent).toHaveLength(0);
  });

  it('confirm is allowed inside the early window and refused before it (too_early)', async () => {
    const { svc, caregiver, patient, code } = setup();
    await svc.createSchedule(caregiver, pill); // due in 5 minutes: within the early window
    expect(await code(async () => svc.confirm(patient, (await svc.today(patient))[0]!.id))).toBe(
      'ok',
    );
    const s2 = setup();
    await s2.svc.createSchedule(s2.caregiver, { ...pill, localTime: '18:00' });
    expect(
      await s2.code(
        async () => await s2.svc.confirm(s2.patient, (await s2.svc.today(s2.patient))[0]!.id),
      ),
    ).toBe('409:too_early');
  });

  it('after the alert a patient cannot confirm a pill (ask caregiver); the caregiver can', async () => {
    const { svc, caregiver, patient, min, code, first } = setup();
    await svc.createSchedule(caregiver, pill);
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    const id = (await first()).id;
    expect((await first()).phase).toBe('missed');
    expect(await code(async () => svc.confirm(patient, id))).toBe('409:expired_ask_caregiver');
    expect((await svc.confirm(caregiver, id)).occurrence.confirmation).toMatchObject({
      method: 'caregiver',
    });
  });

  it('a missed non-pill reminder may still be confirmed late', async () => {
    const { svc, caregiver, patient, min, code, first } = setup();
    await svc.createSchedule(caregiver, { ...pill, kind: 'brush_teeth' });
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    expect(await code(async () => svc.confirm(patient, (await first()).id))).toBe('ok');
  });
});

describe('time zones and DST', () => {
  it('one occurrence per local day, and 02:30 on spring-forward day fires at 03:30 local', async () => {
    const clock = new FakeClock('2026-03-08T06:00:00Z');
    const svc = createReminderService({
      store: new MemoryStore(),
      bus: new EventBus(),
      notifier: () => createMockNotifier(),
      now: clock.now,
    });
    const { caregiver } = createLinkedPair();
    clock.advance(-86_400_000); // create the schedule the day before
    await svc.createSchedule(caregiver, { ...pill, localTime: '02:30' });
    clock.advance(86_400_000);
    const [o] = await svc.today(caregiver);
    expect(o!.dueAt).toBe('2026-03-08T07:30:00.000Z');
    expect(await svc.today(caregiver)).toHaveLength(1);
  });

  it('only the configured weekdays generate reminders', async () => {
    const { svc, caregiver } = setup();
    await svc.createSchedule(caregiver, { ...pill, daysOfWeek: [2, 3] }); // Tue, Wed; today is Monday
    expect(await svc.today(caregiver)).toEqual([]);
  });
});

describe('authorization', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => void (ctx = setup()));

  it('circle members are denied everything, even with grants', async () => {
    const { svc, patient, caregiver, code } = ctx;
    const member = createCircleMember(patient, { locationGrant: true });
    const s = await svc.createSchedule(caregiver, pill);
    expect(await code(async () => svc.today(member))).toBe('403:forbidden');
    expect(await code(async () => svc.listSchedules(member))).toBe('403:forbidden');
    expect(await code(async () => svc.createSchedule(member, pill))).toBe('403:forbidden');
    expect(await code(async () => svc.deleteSchedule(member, s.id))).toBe('403:forbidden');
  });

  it('only the caregiver manages schedules; the patient cannot', async () => {
    const { svc, patient, caregiver, code } = ctx;
    const s = await svc.createSchedule(caregiver, pill);
    expect(await code(async () => svc.createSchedule(patient, pill))).toBe('403:forbidden');
    expect(await code(async () => svc.updateSchedule(patient, s.id, { paused: true }))).toBe(
      '403:forbidden',
    );
    expect(await code(async () => svc.deleteSchedule(patient, s.id))).toBe('403:forbidden');
  });

  it('unlinked users (no patient) are denied', async () => {
    const { svc, code } = ctx;
    expect(await code(async () => svc.today(createUnlinkedUser('patient')))).toBe('403:not_linked');
    expect(
      await code(async () => svc.createSchedule(createUnlinkedUser('primary_caregiver'), pill)),
    ).toBe('403:not_linked');
  });

  it("another patient's data is a 404, never a 403 or the data", async () => {
    const { svc, caregiver, min, code, first } = ctx;
    const s = await svc.createSchedule(caregiver, pill);
    min(5);
    const id = (await first()).id;
    const other = createLinkedPair();
    expect(await code(async () => svc.confirm(other.patient, id))).toBe('404:not_found');
    expect(await code(async () => svc.confirm(other.caregiver, id))).toBe('404:not_found');
    expect(await code(async () => svc.snooze(other.patient, id))).toBe('404:not_found');
    expect(
      await code(async () => svc.updateSchedule(other.caregiver, s.id, { paused: true })),
    ).toBe('404:not_found');
    expect(await code(async () => svc.deleteSchedule(other.caregiver, s.id))).toBe('404:not_found');
    expect(await svc.today(other.patient)).toEqual([]);
    expect(await svc.listSchedules(other.caregiver)).toEqual([]);
  });

  it('caps schedules per patient (spam)', async () => {
    const { svc, caregiver, code } = ctx;
    for (let i = 0; i < 20; i++) await svc.createSchedule(caregiver, pill);
    expect(await code(async () => svc.createSchedule(caregiver, pill))).toBe('409:too_many');
  });

  it('editing a time regenerates the untouched occurrence from the new time', async () => {
    const { svc, caregiver } = ctx;
    const s = await svc.createSchedule(caregiver, pill);
    expect((await svc.today(caregiver))[0]!.dueAt).toBe('2026-06-01T12:00:00.000Z');
    await svc.updateSchedule(caregiver, s.id, { localTime: '23:00' });
    expect((await svc.today(caregiver))[0]!.dueAt).toBe('2026-06-02T03:00:00.000Z');
  });
});

describe('history', () => {
  it('summarises the last days for the caregiver and is scoped to the patient', async () => {
    const { svc, caregiver, patient, min, first } = setup();
    await svc.createSchedule(caregiver, pill);
    await svc.createSchedule(caregiver, { ...pill, kind: 'feed_pets' });
    min(5);
    await svc.confirm(patient, (await svc.today(patient)).find((o) => o.kind === 'pill')!.id);
    min(ESCALATE_MIN);
    await svc.sweep();
    const h = await svc.history(caregiver, 7);
    expect(h.summary).toEqual({ confirmed: 1, missed: 1, skipped: 0 });
    expect(h.occurrences).toHaveLength(2);
    expect(await first()).toBeDefined();
    expect((await svc.history(createLinkedPair().caregiver, 7)).occurrences).toEqual([]);
  });
  it('clamps the window and rejects circle members', async () => {
    const { svc, patient } = setup();
    expect((await svc.history(patient, Number.NaN)).days).toBe(7);
    expect((await svc.history(patient, 9999)).days).toBe(30);
    await expect(svc.history(createCircleMember(patient), 7)).rejects.toThrow(HttpError);
  });
});

describe('two processes sharing one store (compare-and-set)', () => {
  function twoSweepers() {
    const clock = new FakeClock(START);
    const store = new MemoryStore();
    const bus = new EventBus();
    const alerts: unknown[] = [];
    bus.on('caregiver.alert', (e) => void alerts.push(e));
    const pushes = createMockNotifier();
    const mk = () => createReminderService({ store, bus, notifier: () => pushes, now: clock.now });
    return { a: mk(), b: mk(), alerts, pushes, clock, ...createLinkedPair() };
  }

  it('alerts the caregiver exactly once even if both sweep at the same moment', async () => {
    const { a, b, alerts, clock, caregiver } = twoSweepers();
    await a.createSchedule(caregiver, pill);
    clock.advance((5 + ESCALATE_MIN) * 60_000);
    await Promise.all([a.sweep(), b.sweep()]);
    expect(alerts).toHaveLength(1);
  });

  it('prompts the patient once per prompt, not once per process', async () => {
    const { a, b, pushes, clock, caregiver } = twoSweepers();
    await a.createSchedule(caregiver, pill);
    clock.advance(5 * 60_000);
    await Promise.all([a.sweep(), b.sweep()]);
    expect(pushes.sent).toHaveLength(1);
  });

  it('two taps at once confirm once', async () => {
    const { a, b, clock, caregiver, patient } = twoSweepers();
    await a.createSchedule(caregiver, pill);
    clock.advance(5 * 60_000);
    const id = (await a.today(patient))[0]!.id;
    const [x, y] = await Promise.all([a.confirm(patient, id), b.confirm(patient, id)]);
    expect([x.alreadyConfirmed, y.alreadyConfirmed].sort()).toEqual([false, true]);
  });
});
