import { describe, expect, it } from 'vitest';
import type { Occurrence, Schedule } from '../../schemas';
import type { ReminderStore } from '../../store';

const sched = (id: string, patientId = 'p1'): Schedule => ({
  id,
  patientId,
  kind: 'pill',
  localTime: '08:00',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  timeZone: 'America/New_York',
  escalate: true,
  paused: false,
  createdBy: 'c1',
  activeFrom: '2026-06-01T00:00:00.000Z',
});
const occ = (id: string, patientId = 'p1'): Occurrence => ({
  id,
  scheduleId: 's1',
  patientId,
  kind: 'pill',
  localDate: '2026-06-01',
  timeZone: 'America/New_York',
  dueAt: '2026-06-01T12:00:00.000Z',
  status: 'pending',
  snoozeCount: 0,
  snoozedUntil: null,
  nudges: 0,
  missedAt: null,
  confirmation: null,
});

/** Every ReminderStore implementation (memory, Supabase) must pass this. */
export function storeContract(name: string, make: () => Promise<ReminderStore> | ReminderStore) {
  describe(`ReminderStore contract: ${name}`, () => {
    it('stores, lists (scoped by patient), updates and deletes schedules', async () => {
      const store = await make();
      await store.putSchedule(sched('a'));
      await store.putSchedule(sched('b', 'p2'));
      expect((await store.listSchedules('p1')).map((s) => s.id)).toEqual(['a']);
      expect((await store.allSchedules()).length).toBeGreaterThanOrEqual(2);
      await store.putSchedule({ ...sched('a'), paused: true });
      expect((await store.getSchedule('a'))?.paused).toBe(true);
      await store.deleteSchedule('a');
      expect(await store.getSchedule('a')).toBeUndefined();
    });

    it('insertOccurrenceIfAbsent inserts once (idempotent)', async () => {
      const store = await make();
      expect(await store.insertOccurrenceIfAbsent(occ('o1'))).toBe(true);
      expect(await store.insertOccurrenceIfAbsent({ ...occ('o1'), status: 'missed' })).toBe(false);
      expect((await store.getOccurrence('o1'))?.status).toBe('pending'); // the second insert changed nothing
    });

    it('updateOccurrenceIf applies a patch only while the expectation holds', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('o2'));
      expect(
        await store.updateOccurrenceIf('o2', { status: ['missed'] }, { nudges: 5 }),
      ).toBeNull();
      expect(await store.updateOccurrenceIf('o2', { nudges: 1 }, { nudges: 5 })).toBeNull();
      const ok = await store.updateOccurrenceIf(
        'o2',
        { status: ['pending'], nudges: 0 },
        { nudges: 1 },
      );
      expect(ok?.nudges).toBe(1);
      expect(await store.updateOccurrenceIf('nope', {}, { nudges: 1 })).toBeNull();
    });

    it('of two racing updates exactly one wins', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('o3'));
      const results = await Promise.all([
        store.updateOccurrenceIf('o3', { status: ['pending'] }, { status: 'missed' }),
        store.updateOccurrenceIf('o3', { status: ['pending'] }, { status: 'missed' }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('lists pending only, scoped listing, and delete', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('o4'));
      await store.insertOccurrenceIfAbsent(occ('o5', 'p9'));
      await store.updateOccurrenceIf('o4', {}, { status: 'confirmed' });
      expect((await store.pendingOccurrences()).map((o) => o.id)).not.toContain('o4');
      expect((await store.listOccurrences('p9')).map((o) => o.id)).toEqual(['o5']);
      await store.deleteOccurrence('o5');
      expect(await store.getOccurrence('o5')).toBeUndefined();
    });

    it('returns copies: mutating a result never changes stored data', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('o6'));
      const got = (await store.getOccurrence('o6'))!;
      got.status = 'missed';
      expect((await store.getOccurrence('o6'))?.status).toBe('pending');
    });
  });
}
