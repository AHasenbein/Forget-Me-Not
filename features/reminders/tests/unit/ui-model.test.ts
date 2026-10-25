import { describe, expect, it } from 'vitest';
import type { Phase } from '../../service';
import {
  adherencePercent,
  auditLabel,
  nextUp,
  untilLabel,
  weekStrip,
  caregiverCounts,
  caregiverError,
  caregiverRows,
  dateLabelFor,
  greetingFor,
  normalizeTime,
  pickPatientFocus,
  pillCheckBadge,
  patientError,
  photoWorthKnowing,
  type OccurrenceView,
} from '../../ui/model';

let n = 0;
const occ = (
  kind: OccurrenceView['kind'],
  phase: Phase,
  dueAt: string,
  extra: Partial<OccurrenceView> = {},
): OccurrenceView => ({
  id: `o${++n}`,
  scheduleId: 's',
  patientId: 'p',
  kind,
  localDate: '2026-06-01',
  timeZone: 'America/New_York',
  dueAt,
  status: phase === 'confirmed' ? 'confirmed' : phase === 'missed' ? 'missed' : 'pending',
  snoozeCount: 0,
  snoozedUntil: null,
  nudges: 0,
  missedAt: null,
  confirmation: null,
  phase,
  ...extra,
});
const fmt = (iso: string) => iso.slice(11, 16);

describe('patient focus: ONE thing at a time', () => {
  it('shows the earliest due reminder as the task, others only as a list', () => {
    const a = occ('brush_teeth', 'due', '2026-06-01T12:30:00Z');
    const b = occ('pill', 'due', '2026-06-01T12:00:00Z');
    const f = pickPatientFocus([a, b], null);
    expect(f).toMatchObject({ kind: 'task', canSnooze: true });
    if (f.kind === 'task') {
      expect(f.occurrence.id).toBe(b.id);
      expect(f.others.map((o) => o.id)).toEqual([a.id]);
    }
  });
  it('hides snooze once the limit is used, or when already overdue', () => {
    expect(
      pickPatientFocus([occ('pill', 'due', '2026-06-01T12:00:00Z', { snoozeCount: 2 })], null),
    ).toMatchObject({ canSnooze: false });
    expect(pickPatientFocus([occ('pill', 'overdue', '2026-06-01T12:00:00Z')], null)).toMatchObject({
      canSnooze: false,
    });
  });
  it('a missed pill tells the patient to ask the caregiver (no retry); other kinds may retry', () => {
    expect(pickPatientFocus([occ('pill', 'missed', '2026-06-01T12:00:00Z')], null)).toMatchObject({
      kind: 'told',
      canRetry: false,
    });
    expect(pickPatientFocus([occ('shower', 'missed', '2026-06-01T12:00:00Z')], null)).toMatchObject(
      { kind: 'told', canRetry: true },
    );
  });
  it('with several missed, a missed pill is the one shown', () => {
    const shower = occ('shower', 'missed', '2026-06-01T23:00:00Z');
    const pillMissed = occ('pill', 'missed', '2026-06-01T12:00:00Z');
    const f = pickPatientFocus([pillMissed, shower], null);
    expect(f.kind === 'told' && f.occurrence.id).toBe(pillMissed.id);
  });
  it('a task outranks a missed one; just-confirmed shows "done" until it clears', () => {
    const task = occ('feed_pets', 'due', '2026-06-01T17:00:00Z');
    expect(pickPatientFocus([occ('pill', 'missed', '2026-06-01T12:00:00Z'), task], null).kind).toBe(
      'task',
    );
    const done = occ('pill', 'confirmed', '2026-06-01T12:00:00Z');
    expect(pickPatientFocus([done], done.id).kind).toBe('done');
    expect(pickPatientFocus([done], null)).toMatchObject({
      kind: 'idle',
      doneCount: 1,
      total: 1,
      next: null,
    });
  });
  it('idle points at the next one', () => {
    const next = occ('shower', 'upcoming', '2026-06-01T23:00:00Z');
    expect(
      pickPatientFocus([next, occ('pill', 'confirmed', '2026-06-01T12:00:00Z')], null),
    ).toMatchObject({ kind: 'idle', next: { id: next.id } });
  });
});

describe('caregiver view', () => {
  it('flags missed as needing attention and allows marking done', () => {
    const rows = caregiverRows(
      [
        occ('pill', 'missed', '2026-06-01T12:00:00Z'),
        occ('shower', 'upcoming', '2026-06-01T23:00:00Z'),
        occ('feed_pets', 'confirmed', '2026-06-01T17:00:00Z', {
          confirmation: {
            at: '2026-06-01T17:02:00Z',
            by: 'u',
            method: 'caregiver',
            verification: 'unverified',
          },
        }),
      ],
      fmt,
    );
    expect(rows.map((r) => r.tone)).toEqual(['danger', 'success', 'neutral']);
    expect(rows[0]).toMatchObject({ needsAttention: true, canMarkDone: true });
    expect(rows[1]!.status).toBe('Done 17:02 by you');
    expect(caregiverCounts(rows)).toEqual({ done: 1, attention: 1, upcoming: 1, review: 0 });
  });
});

describe('error wording', () => {
  it('never shows a code to the patient', () => {
    for (const code of [
      'expired_ask_caregiver',
      'too_soon',
      'too_early',
      'snooze_limit',
      'offline',
      'weird_new_code',
    ])
      expect(patientError(code)).not.toMatch(/_|\b[a-z]+_[a-z]+\b/);
  });
  it('caregiver gets a specific explanation for double-dose protection', () => {
    expect(caregiverError('too_soon')).toMatch(/double dose/);
  });
});

describe('normalizeTime', () => {
  it('accepts friendly input and rejects nonsense', () => {
    expect(normalizeTime('8:05')).toBe('08:05');
    expect(normalizeTime('805')).toBe('08:05');
    expect(normalizeTime(' 21:30 ')).toBe('21:30');
    expect(normalizeTime('9')).toBe('09:00');
    for (const bad of ['', '25:00', '12:60', 'noon', '8:5']) expect(normalizeTime(bad)).toBeNull();
  });
});

describe('pill photo check (caregiver view)', () => {
  const conf = (
    verification: 'unverified' | 'pending_review' | 'verified' | 'rejected',
    extra = {},
  ) =>
    occ('pill', 'confirmed', '2026-06-01T12:00:00Z', {
      confirmation: {
        at: '2026-06-01T12:01:00Z',
        by: 'u',
        method: 'video',
        verification,
        ...extra,
      },
    });
  it('labels each state, and only unclear/rejected need a review', () => {
    expect(pillCheckBadge(conf('verified'))).toEqual({
      label: 'Photo check passed',
      tone: 'success',
    });
    expect(pillCheckBadge(conf('verified', { reviewedBy: 'c' }))?.label).toBe('Photos approved');
    expect(pillCheckBadge(conf('pending_review'))?.tone).toBe('warn');
    expect(pillCheckBadge(conf('rejected'))?.tone).toBe('danger');
    expect(pillCheckBadge(occ('shower', 'confirmed', '2026-06-01T12:00:00Z'))).toBeNull();
    const rows = caregiverRows([conf('verified'), conf('pending_review'), conf('rejected')], fmt);
    expect(rows.map((r) => r.needsReview)).toEqual([false, true, true]);
    expect(caregiverCounts(rows).review).toBe(2);
  });
  it('a pill the caregiver gave in person has no photo badge', () => {
    const o = occ('pill', 'confirmed', '2026-06-01T12:00:00Z', {
      confirmation: { at: 'x', by: 'c', method: 'caregiver', verification: 'unverified' },
    });
    expect(pillCheckBadge(o)).toBeNull();
  });
});

describe('greetingFor / dateLabelFor (server time, not device time)', () => {
  it('greets by the hour in the given zone', () => {
    expect(greetingFor('2026-06-02T08:00:00Z', 'UTC')).toBe('Good morning');
    expect(greetingFor('2026-06-02T13:00:00Z', 'UTC')).toBe('Good afternoon');
    expect(greetingFor('2026-06-02T20:00:00Z', 'UTC')).toBe('Good evening');
    expect(greetingFor('2026-06-02T00:30:00Z', 'UTC')).toBe('Good morning'); // midnight hour
  });
  it('shows the weekday and date', () => {
    expect(dateLabelFor('2026-06-02T08:00:00Z', 'UTC')).toBe('Tuesday, June 2');
  });
});

describe('caregiver insights', () => {
  it('untilLabel counts from the server now', () => {
    expect(untilLabel('2026-06-02T08:00:00Z', '2026-06-02T08:25:00Z')).toBe('in 25 min');
    expect(untilLabel('2026-06-02T08:00:00Z', '2026-06-02T10:05:00Z')).toBe('in 2 h 5 min');
    expect(untilLabel('2026-06-02T08:00:00Z', '2026-06-02T11:00:00Z')).toBe('in 3 h');
    expect(untilLabel('2026-06-02T08:00:00Z', '2026-06-02T07:59:00Z')).toBe('now');
  });
  it('adherencePercent ignores skipped and handles no data', () => {
    expect(adherencePercent({ confirmed: 0, missed: 0 })).toBeNull();
    expect(adherencePercent({ confirmed: 3, missed: 1 })).toBe(75);
  });
  it('nextUp picks the soonest not-yet-happened reminder', () => {
    const a = occ('pill', 'upcoming', '2026-06-02T12:00:00Z');
    const b = occ('shower', 'snoozed', '2026-06-02T10:00:00Z');
    const c = occ('feed_pets', 'confirmed', '2026-06-02T09:00:00Z');
    expect(nextUp([a, b, c])?.id).toBe(b.id);
    expect(nextUp([c])).toBeNull();
  });
  it('weekStrip buckets by day in the zone and marks today', () => {
    const items = [
      occ('pill', 'confirmed', '2026-06-02T08:00:00Z'),
      occ('pill', 'missed', '2026-06-01T08:00:00Z'),
      occ('shower', 'confirmed', '2026-06-01T09:00:00Z'),
    ];
    const strip = weekStrip(items, '2026-06-02T12:00:00Z', 'UTC');
    expect(strip).toHaveLength(7);
    expect(strip[6]).toMatchObject({ label: 'Tue', done: 1, missed: 0, isToday: true });
    expect(strip[5]).toMatchObject({ label: 'Mon', done: 1, missed: 1, isToday: false });
  });
  it('auditLabel falls back safely', () => {
    expect(auditLabel('pill_frames_viewed')).toMatch(/viewed/);
    expect(auditLabel('something_new')).toBe('Activity recorded');
  });
});

describe('photoWorthKnowing (dashboard "Worth knowing" box)', () => {
  it('only what ANOTHER caregiver did, grouped, newest time kept', () => {
    const rows = [
      { action: 'pill_frames_viewed', at: '2026-10-25T10:00:00Z', byYou: false },
      { action: 'pill_frames_viewed', at: '2026-10-25T09:00:00Z', byYou: true },
      { action: 'pill_frames_viewed', at: '2026-10-25T08:00:00Z', byYou: false },
      { action: 'pill_check_reviewed', at: '2026-10-25T07:00:00Z', byYou: false },
    ];
    expect(photoWorthKnowing(rows)).toEqual([
      {
        action: 'pill_frames_viewed',
        text: 'Another caregiver viewed pill photos',
        count: 2,
        lastAt: '2026-10-25T10:00:00Z',
      },
      {
        action: 'pill_check_reviewed',
        text: 'Another caregiver reviewed a pill photo check',
        count: 1,
        lastAt: '2026-10-25T07:00:00Z',
      },
    ]);
  });

  it('your own views are full-record only', () => {
    expect(photoWorthKnowing([{ action: 'pill_frames_viewed', at: 'x', byYou: true }])).toEqual([]);
  });
});
