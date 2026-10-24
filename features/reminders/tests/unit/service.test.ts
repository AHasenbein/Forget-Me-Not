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
  const first = () => svc.today(caregiver)[0]!;
  return { svc, clock, notifier, alerts, patient, caregiver, min, code, first };
}

describe('happy path', () => {
  it('caregiver schedules, patient sees today and confirms with one tap', () => {
    const { svc, patient, caregiver, min, first } = setup();
    svc.createSchedule(caregiver, pill);
    expect(first().phase).toBe('upcoming');
    min(10);
    const o = svc.today(patient)[0]!;
    expect(o.phase).toBe('due');
    const res = svc.confirm(patient, o.id);
    expect(res.alreadyConfirmed).toBe(false);
    expect(res.occurrence.confirmation).toMatchObject({
      method: 'tap',
      verification: 'unverified',
      by: patient.id,
    });
  });

  it('prompts the patient, then again, and sends NO alert when confirmed in time', async () => {
    const { svc, patient, caregiver, notifier, alerts, min, first } = setup();
    svc.createSchedule(caregiver, pill);
    min(5); // 08:00
    await svc.sweep();
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]).toMatchObject({ to: patient.id, body: 'Time to take your pill' });
    min(15);
    await svc.sweep();
    expect(notifier.sent).toHaveLength(2);
    svc.confirm(patient, first().id);
    min(60);
    await svc.sweep();
    expect(alerts).toEqual([]);
  });

  it('works for every reminder kind', () => {
    const { svc, caregiver } = setup();
    for (const kind of ['pill', 'brush_teeth', 'shower', 'feed_pets'] as const)
      svc.createSchedule(caregiver, { ...pill, kind, localTime: '09:00' });
    expect(svc.today(caregiver)).toHaveLength(4);
  });
});

describe('escalation', () => {
  it('alerts the caregiver once, with ids/enums only, when unconfirmed', async () => {
    const { svc, caregiver, patient, alerts, min } = setup();
    svc.createSchedule(caregiver, pill);
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
    svc.createSchedule(caregiver, { ...pill, kind: 'feed_pets' });
    svc.createSchedule(caregiver, { ...pill, kind: 'shower', escalate: false });
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    expect(alerts.map((a) => a.severity)).toEqual(['warning']);
  });

  it('a very late sweep (server was down) still alerts but never prompts the patient', async () => {
    const { svc, caregiver, alerts, notifier, min } = setup();
    svc.createSchedule(caregiver, pill);
    min(5 + 6 * 60);
    await svc.sweep();
    expect(alerts).toHaveLength(1);
    expect(notifier.sent).toHaveLength(0);
  });

  it('paused schedules (asleep / in hospital) neither prompt nor alert', async () => {
    const { svc, caregiver, alerts, notifier, min } = setup();
    const s = svc.createSchedule(caregiver, pill);
    svc.updateSchedule(caregiver, s.id, { paused: true });
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    expect(alerts).toEqual([]);
    expect(notifier.sent).toEqual([]);
  });

  it('a schedule created after its time today does not produce a spurious missed alert', async () => {
    const { svc, caregiver, alerts, min } = setup();
    min(5 + 3 * 60); // 11:00 local
    svc.createSchedule(caregiver, pill); // 08:00 already passed today
    await svc.sweep();
    expect(svc.today(caregiver)).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it('confirming on the due day then sweeping later never alerts', async () => {
    const { svc, caregiver, patient, alerts, min, first } = setup();
    svc.createSchedule(caregiver, pill);
    min(5);
    svc.confirm(patient, first().id);
    min(24 * 60);
    await svc.sweep();
    expect(alerts).toEqual([]);
  });
});

describe('snooze abuse', () => {
  it('allows at most MAX_SNOOZES, each pushes the alert back, then 409 snooze_limit', async () => {
    const { svc, caregiver, patient, alerts, min, code, first } = setup();
    svc.createSchedule(caregiver, pill);
    min(5);
    const id = first().id;
    for (let i = 0; i < MAX_SNOOZES; i++)
      expect(await code(() => svc.snooze(patient, id))).toBe('ok');
    expect(await code(() => svc.snooze(patient, id))).toBe('409:snooze_limit');
    min(ESCALATE_MIN); // original escalation time has passed, but snoozes extended it
    await svc.sweep();
    expect(alerts).toEqual([]);
    min(MAX_SNOOZES * 10);
    await svc.sweep();
    expect(alerts).toHaveLength(1);
  });

  it('cannot snooze before it is due, after the alert, or as a caregiver', async () => {
    const { svc, caregiver, patient, min, code, first } = setup();
    svc.createSchedule(caregiver, pill);
    const id = first().id;
    expect(await code(() => svc.snooze(patient, id))).toBe('409:not_due');
    min(5);
    expect(await code(() => svc.snooze(caregiver, id))).toBe('403:forbidden');
    min(ESCALATE_MIN);
    expect(await code(() => svc.snooze(patient, id))).toBe('409:overdue');
  });
});

describe('double-dose risk', () => {
  it('a second tap is idempotent (no second confirmation)', () => {
    const { svc, caregiver, patient, min, first } = setup();
    svc.createSchedule(caregiver, pill);
    min(5);
    const id = first().id;
    const a = svc.confirm(patient, id);
    min(1);
    const b = svc.confirm(patient, id);
    expect(b.alreadyConfirmed).toBe(true);
    expect(b.occurrence.confirmation).toEqual(a.occurrence.confirmation);
  });

  it('two pill schedules close together: the second confirm is refused (too_soon)', async () => {
    const { svc, caregiver, patient, min, code } = setup();
    svc.createSchedule(caregiver, pill);
    svc.createSchedule(caregiver, { ...pill, localTime: '08:30' });
    min(40); // 08:35 local: both due
    const [a, b] = svc.today(patient);
    expect(await code(() => svc.confirm(patient, a!.id))).toBe('ok');
    expect(await code(() => svc.confirm(patient, b!.id))).toBe('409:too_soon');
  });

  it('a pill due right after a confirmed pill is skipped, not prompted', async () => {
    const { svc, caregiver, patient, notifier, min } = setup();
    svc.createSchedule(caregiver, pill);
    svc.createSchedule(caregiver, { ...pill, localTime: '08:30' });
    min(5);
    svc.confirm(patient, svc.today(patient)[0]!.id);
    min(30); // 08:30
    await svc.sweep();
    expect(svc.today(patient)[1]!.phase).toBe('skipped');
    expect(notifier.sent).toHaveLength(0);
  });

  it('confirm is allowed inside the early window and refused before it (too_early)', async () => {
    const { svc, caregiver, patient, code } = setup();
    svc.createSchedule(caregiver, pill); // due in 5 minutes: within the early window
    expect(await code(() => svc.confirm(patient, svc.today(patient)[0]!.id))).toBe('ok');
    const s2 = setup();
    s2.svc.createSchedule(s2.caregiver, { ...pill, localTime: '18:00' });
    expect(await s2.code(() => s2.svc.confirm(s2.patient, s2.svc.today(s2.patient)[0]!.id))).toBe(
      '409:too_early',
    );
  });

  it('after the alert a patient cannot confirm a pill (ask caregiver); the caregiver can', async () => {
    const { svc, caregiver, patient, min, code, first } = setup();
    svc.createSchedule(caregiver, pill);
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    const id = first().id;
    expect(first().phase).toBe('missed');
    expect(await code(() => svc.confirm(patient, id))).toBe('409:expired_ask_caregiver');
    expect(svc.confirm(caregiver, id).occurrence.confirmation).toMatchObject({
      method: 'caregiver',
    });
  });

  it('a missed non-pill reminder may still be confirmed late', async () => {
    const { svc, caregiver, patient, min, code, first } = setup();
    svc.createSchedule(caregiver, { ...pill, kind: 'brush_teeth' });
    min(5 + ESCALATE_MIN);
    await svc.sweep();
    expect(await code(() => svc.confirm(patient, first().id))).toBe('ok');
  });
});

describe('time zones and DST', () => {
  it('one occurrence per local day, and 02:30 on spring-forward day fires at 03:30 local', () => {
    const clock = new FakeClock('2026-03-08T06:00:00Z');
    const svc = createReminderService({
      store: new MemoryStore(),
      bus: new EventBus(),
      notifier: () => createMockNotifier(),
      now: clock.now,
    });
    const { caregiver } = createLinkedPair();
    clock.advance(-86_400_000); // create the schedule the day before
    svc.createSchedule(caregiver, { ...pill, localTime: '02:30' });
    clock.advance(86_400_000);
    const [o] = svc.today(caregiver);
    expect(o!.dueAt).toBe('2026-03-08T07:30:00.000Z');
    expect(svc.today(caregiver)).toHaveLength(1);
  });

  it('only the configured weekdays generate reminders', () => {
    const { svc, caregiver } = setup();
    svc.createSchedule(caregiver, { ...pill, daysOfWeek: [2, 3] }); // Tue, Wed; today is Monday
    expect(svc.today(caregiver)).toEqual([]);
  });
});

describe('authorization', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => void (ctx = setup()));

  it('circle members are denied everything, even with grants', async () => {
    const { svc, patient, caregiver, code } = ctx;
    const member = createCircleMember(patient, { locationGrant: true });
    const s = svc.createSchedule(caregiver, pill);
    expect(await code(() => svc.today(member))).toBe('403:forbidden');
    expect(await code(() => svc.listSchedules(member))).toBe('403:forbidden');
    expect(await code(() => svc.createSchedule(member, pill))).toBe('403:forbidden');
    expect(await code(() => svc.deleteSchedule(member, s.id))).toBe('403:forbidden');
  });

  it('only the caregiver manages schedules; the patient cannot', async () => {
    const { svc, patient, caregiver, code } = ctx;
    const s = svc.createSchedule(caregiver, pill);
    expect(await code(() => svc.createSchedule(patient, pill))).toBe('403:forbidden');
    expect(await code(() => svc.updateSchedule(patient, s.id, { paused: true }))).toBe(
      '403:forbidden',
    );
    expect(await code(() => svc.deleteSchedule(patient, s.id))).toBe('403:forbidden');
  });

  it('unlinked users (no patient) are denied', async () => {
    const { svc, code } = ctx;
    expect(await code(() => svc.today(createUnlinkedUser('patient')))).toBe('403:not_linked');
    expect(
      await code(() => svc.createSchedule(createUnlinkedUser('primary_caregiver'), pill)),
    ).toBe('403:not_linked');
  });

  it("another patient's data is a 404, never a 403 or the data", async () => {
    const { svc, caregiver, min, code, first } = ctx;
    const s = svc.createSchedule(caregiver, pill);
    min(5);
    const id = first().id;
    const other = createLinkedPair();
    expect(await code(() => svc.confirm(other.patient, id))).toBe('404:not_found');
    expect(await code(() => svc.confirm(other.caregiver, id))).toBe('404:not_found');
    expect(await code(() => svc.snooze(other.patient, id))).toBe('404:not_found');
    expect(await code(() => svc.updateSchedule(other.caregiver, s.id, { paused: true }))).toBe(
      '404:not_found',
    );
    expect(await code(() => svc.deleteSchedule(other.caregiver, s.id))).toBe('404:not_found');
    expect(svc.today(other.patient)).toEqual([]);
    expect(svc.listSchedules(other.caregiver)).toEqual([]);
  });

  it('caps schedules per patient (spam)', async () => {
    const { svc, caregiver, code } = ctx;
    for (let i = 0; i < 20; i++) svc.createSchedule(caregiver, pill);
    expect(await code(() => svc.createSchedule(caregiver, pill))).toBe('409:too_many');
  });

  it('editing a time regenerates the untouched occurrence from the new time', () => {
    const { svc, caregiver } = ctx;
    const s = svc.createSchedule(caregiver, pill);
    expect(svc.today(caregiver)[0]!.dueAt).toBe('2026-06-01T12:00:00.000Z');
    svc.updateSchedule(caregiver, s.id, { localTime: '23:00' });
    expect(svc.today(caregiver)[0]!.dueAt).toBe('2026-06-02T03:00:00.000Z');
  });
});

describe('history', () => {
  it('summarises the last days for the caregiver and is scoped to the patient', async () => {
    const { svc, caregiver, patient, min, first } = setup();
    svc.createSchedule(caregiver, pill);
    svc.createSchedule(caregiver, { ...pill, kind: 'feed_pets' });
    min(5);
    svc.confirm(patient, svc.today(patient).find((o) => o.kind === 'pill')!.id);
    min(ESCALATE_MIN);
    await svc.sweep();
    const h = svc.history(caregiver, 7);
    expect(h.summary).toEqual({ confirmed: 1, missed: 1, skipped: 0 });
    expect(h.occurrences).toHaveLength(2);
    expect(first()).toBeDefined();
    expect(svc.history(createLinkedPair().caregiver, 7).occurrences).toEqual([]);
  });
  it('clamps the window and rejects circle members', () => {
    const { svc, patient } = setup();
    expect(svc.history(patient, Number.NaN).days).toBe(7);
    expect(svc.history(patient, 9999).days).toBe(30);
    expect(() => svc.history(createCircleMember(patient), 7)).toThrow(HttpError);
  });
});
