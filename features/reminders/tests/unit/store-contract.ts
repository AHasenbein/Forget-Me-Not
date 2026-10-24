import { describe, expect, it } from 'vitest';
import type { Occurrence, Schedule } from '../../schemas';
import type { ReminderStore } from '../../store';

const sched = (id: string, patientId = 'ct-p1'): Schedule => ({
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
const occ = (id: string, patientId = 'ct-p1'): Occurrence => ({
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
      await store.putSchedule(sched('ct-a'));
      await store.putSchedule(sched('ct-b', 'ct-p2'));
      expect((await store.listSchedules('ct-p1')).map((s) => s.id)).toEqual(['ct-a']);
      expect((await store.allSchedules()).length).toBeGreaterThanOrEqual(2);
      await store.putSchedule({ ...sched('ct-a'), paused: true });
      expect((await store.getSchedule('ct-a'))?.paused).toBe(true);
      await store.deleteSchedule('ct-a');
      expect(await store.getSchedule('ct-a')).toBeUndefined();
    });

    it('insertOccurrenceIfAbsent inserts once (idempotent)', async () => {
      const store = await make();
      expect(await store.insertOccurrenceIfAbsent(occ('ct-o1'))).toBe(true);
      expect(await store.insertOccurrenceIfAbsent({ ...occ('ct-o1'), status: 'missed' })).toBe(
        false,
      );
      expect((await store.getOccurrence('ct-o1'))?.status).toBe('pending'); // the second insert changed nothing
    });

    it('updateOccurrenceIf applies a patch only while the expectation holds', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('ct-o2'));
      expect(
        await store.updateOccurrenceIf('ct-o2', { status: ['missed'] }, { nudges: 5 }),
      ).toBeNull();
      expect(await store.updateOccurrenceIf('ct-o2', { nudges: 1 }, { nudges: 5 })).toBeNull();
      const ok = await store.updateOccurrenceIf(
        'ct-o2',
        { status: ['pending'], nudges: 0 },
        { nudges: 1 },
      );
      expect(ok?.nudges).toBe(1);
      expect(await store.updateOccurrenceIf('ct-nope', {}, { nudges: 1 })).toBeNull();
    });

    it('of two racing updates exactly one wins', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('ct-o3'));
      const results = await Promise.all([
        store.updateOccurrenceIf('ct-o3', { status: ['pending'] }, { status: 'missed' }),
        store.updateOccurrenceIf('ct-o3', { status: ['pending'] }, { status: 'missed' }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('lists pending only, scoped listing, and delete', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('ct-o4'));
      await store.insertOccurrenceIfAbsent(occ('ct-o5', 'ct-p9'));
      await store.updateOccurrenceIf('ct-o4', {}, { status: 'confirmed' });
      expect((await store.pendingOccurrences()).map((o) => o.id)).not.toContain('ct-o4');
      expect((await store.listOccurrences('ct-p9')).map((o) => o.id)).toEqual(['ct-o5']);
      await store.deleteOccurrence('ct-o5');
      expect(await store.getOccurrence('ct-o5')).toBeUndefined();
    });

    it('returns copies: mutating a result never changes stored data', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent(occ('ct-o6'));
      const got = (await store.getOccurrence('ct-o6'))!;
      got.status = 'missed';
      expect((await store.getOccurrence('ct-o6'))?.status).toBe('pending');
    });
  });
}

/** Frames + audit + the verification expectation (added with the pill check). */
export function storeContractPillCheck(
  name: string,
  make: () => Promise<ReminderStore> | ReminderStore,
) {
  const frame = (id: string, createdAt: string, occ = 'ct-pc1') => ({
    id,
    occurrenceId: occ,
    patientId: 'ct-p1',
    mediaType: 'image/png' as const,
    data: 'iVBORw0KGgo=',
    createdAt,
  });
  describe(`ReminderStore pill-check contract: ${name}`, () => {
    it('stores frames per occurrence, deletes one occurrence, and deletes by age', async () => {
      const store = await make();
      await store.putFrames([
        frame('ct-f1', '2026-01-01T00:00:00.000Z'),
        frame('ct-f2', '2026-06-01T00:00:00.000Z'),
      ]);
      await store.putFrames([frame('ct-f3', '2026-06-01T00:00:00.000Z', 'ct-pc2')]);
      expect((await store.getFrames('ct-pc1')).map((f) => f.id)).toEqual(['ct-f1', 'ct-f2']);
      expect(await store.deleteFramesOlderThan('2026-03-01T00:00:00.000Z')).toBe(1);
      expect((await store.getFrames('ct-pc1')).map((f) => f.id)).toEqual(['ct-f2']);
      await store.deleteFrames('ct-pc2');
      expect(await store.getFrames('ct-pc2')).toEqual([]);
    });

    it('lists audit entries newest first, scoped to the patient, with a limit', async () => {
      const store = await make();
      const e = (id: string, at: string, patientId = 'ct-p1') => ({
        id,
        at,
        actorId: 'c1',
        patientId,
        action: 'pill_frames_viewed' as const,
        occurrenceId: 'ct-pc1',
      });
      await store.addAudit(e('ct-a1', '2026-06-01T10:00:00.000Z'));
      await store.addAudit(e('ct-a2', '2026-06-01T11:00:00.000Z'));
      await store.addAudit(e('ct-a3', '2026-06-01T12:00:00.000Z', 'ct-p2'));
      expect((await store.listAudit('ct-p1', 10)).map((a) => a.id)).toEqual(['ct-a2', 'ct-a1']);
      expect(await store.listAudit('ct-p1', 1)).toHaveLength(1);
    });

    it('updateOccurrenceIf honours the verification expectation', async () => {
      const store = await make();
      await store.insertOccurrenceIfAbsent({
        id: 'ct-pc3',
        scheduleId: 's',
        patientId: 'ct-p1',
        kind: 'pill',
        localDate: '2026-06-01',
        timeZone: 'UTC',
        dueAt: '2026-06-01T12:00:00.000Z',
        status: 'confirmed',
        snoozeCount: 0,
        snoozedUntil: null,
        nudges: 0,
        missedAt: null,
        confirmation: {
          at: '2026-06-01T12:01:00.000Z',
          by: 'u',
          method: 'tap',
          verification: 'unverified',
        },
      });
      const conf = (v: 'verified' | 'rejected') => ({
        confirmation: {
          at: '2026-06-01T12:01:00.000Z',
          by: 'u',
          method: 'video' as const,
          verification: v,
        },
      });
      expect(
        await store.updateOccurrenceIf(
          'ct-pc3',
          { verification: ['pending_review'] },
          conf('verified'),
        ),
      ).toBeNull();
      expect(
        (
          await store.updateOccurrenceIf(
            'ct-pc3',
            { verification: ['unverified'] },
            conf('verified'),
          )
        )?.confirmation?.verification,
      ).toBe('verified');
      const raced = await Promise.all([
        store.updateOccurrenceIf('ct-pc3', { verification: ['verified'] }, conf('rejected')),
        store.updateOccurrenceIf('ct-pc3', { verification: ['verified'] }, conf('rejected')),
      ]);
      expect(raced.filter(Boolean)).toHaveLength(1);
    });
  });
}
