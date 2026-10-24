import type { Occurrence, ReminderKind } from '../schemas';
import type { Phase } from '../service';

/** What the API returns for an occurrence. */
export type OccurrenceView = Occurrence & { phase: Phase };

export const KIND: Record<
  ReminderKind,
  { emoji: string; task: string; label: string; done: string }
> = {
  pill: { emoji: '💊', task: 'Time to take your pill', label: 'Pill', done: 'I took it' },
  brush_teeth: {
    emoji: '🪥',
    task: 'Time to brush your teeth',
    label: 'Brush teeth',
    done: 'I did it',
  },
  shower: { emoji: '🚿', task: 'Time for your shower', label: 'Shower', done: 'I did it' },
  feed_pets: { emoji: '🐾', task: 'Time to feed your pets', label: 'Feed pets', done: 'I did it' },
};

export type PatientFocus =
  | { kind: 'task'; occurrence: OccurrenceView; canSnooze: boolean; others: OccurrenceView[] }
  | { kind: 'told'; occurrence: OccurrenceView; canRetry: boolean }
  | { kind: 'done'; occurrence: OccurrenceView }
  | { kind: 'idle'; next: OccurrenceView | null; doneCount: number; total: number };

const byDue = (a: OccurrenceView, b: OccurrenceView) => a.dueAt.localeCompare(b.dueAt);

/**
 * ONE thing at a time for the patient (root rule: one primary action per screen).
 * Priority: something to do now > a missed one we told the caregiver about > "all done" for a moment > idle.
 */
export function pickPatientFocus(
  items: readonly OccurrenceView[],
  justConfirmedId: string | null,
  maxSnoozes = 2,
): PatientFocus {
  const tasks = items.filter((o) => o.phase === 'due' || o.phase === 'overdue').sort(byDue);
  if (tasks[0])
    return {
      kind: 'task',
      occurrence: tasks[0],
      canSnooze: tasks[0].phase === 'due' && tasks[0].snoozeCount < maxSnoozes,
      others: tasks.slice(1),
    };
  // A missed pill outranks everything else (it is the one that needs the caregiver); otherwise the latest.
  const missed = items.filter((o) => o.phase === 'missed').sort(byDue);
  const lastMissed = missed.find((o) => o.kind === 'pill') ?? missed[missed.length - 1];
  if (lastMissed)
    return { kind: 'told', occurrence: lastMissed, canRetry: lastMissed.kind !== 'pill' };
  const just = justConfirmedId ? items.find((o) => o.id === justConfirmedId) : undefined;
  if (just) return { kind: 'done', occurrence: just };
  const upcoming = items.filter((o) => o.phase === 'upcoming' || o.phase === 'snoozed').sort(byDue);
  return {
    kind: 'idle',
    next: upcoming[0] ?? null,
    doneCount: items.filter((o) => o.phase === 'confirmed').length,
    total: items.filter((o) => o.phase !== 'skipped').length,
  };
}

/** Plain words only: the patient never sees a code. */
export function patientError(code: string): string {
  switch (code) {
    case 'offline':
      return 'I can’t reach the app right now. Please try again in a moment.';
    case 'expired_ask_caregiver':
    case 'too_soon':
      return 'Please ask your caregiver before you take this.';
    case 'too_early':
      return 'It’s not time yet.';
    case 'snooze_limit':
      return 'I can’t wait any longer this time.';
    default:
      return 'That didn’t work. Please try again.';
  }
}

export function caregiverError(code: string): string {
  switch (code) {
    case 'offline':
      return 'Can’t reach the server.';
    case 'too_soon':
      return 'Another pill was confirmed less than 2 hours ago. Not confirmed, to avoid a double dose.';
    case 'too_many':
      return 'That’s the most reminders allowed (20).';
    case 'not_found':
      return 'That reminder no longer exists.';
    default:
      return `That didn’t work (${code}).`;
  }
}

export type RowTone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';
export interface CaregiverRow {
  occurrence: OccurrenceView;
  status: string;
  tone: RowTone;
  needsAttention: boolean;
  canMarkDone: boolean;
}

/** Wording for how the confirmation happened: "by Margaret" / "by you". */
export function confirmedBy(o: OccurrenceView): string {
  const c = o.confirmation;
  if (!c) return '';
  return c.method === 'caregiver' ? 'by you' : 'by patient';
}

export function caregiverRows(
  items: readonly OccurrenceView[],
  fmt: (iso: string, tz: string) => string,
): CaregiverRow[] {
  return [...items].sort(byDue).map((o) => {
    const at = fmt(o.dueAt, o.timeZone);
    const base = { occurrence: o, needsAttention: false, canMarkDone: false };
    switch (o.phase) {
      case 'confirmed':
        return {
          ...base,
          status:
            `Done ${o.confirmation ? fmt(o.confirmation.at, o.timeZone) : ''} ${confirmedBy(o)}`.trim(),
          tone: 'success' as const,
        };
      case 'missed':
      case 'overdue':
        return {
          ...base,
          status: `Missed (was ${at})`,
          tone: 'danger' as const,
          needsAttention: true,
          canMarkDone: true,
        };
      case 'due':
        return { ...base, status: `Due now (${at})`, tone: 'warn' as const, canMarkDone: true };
      case 'snoozed':
        return { ...base, status: `Snoozed, due ${at}`, tone: 'warn' as const, canMarkDone: true };
      case 'skipped':
        return { ...base, status: 'Skipped', tone: 'neutral' as const };
      default:
        return { ...base, status: `At ${at}`, tone: 'neutral' as const };
    }
  });
}

export function caregiverCounts(rows: readonly CaregiverRow[]) {
  const n = (f: (r: CaregiverRow) => boolean) => rows.filter(f).length;
  return {
    done: n((r) => r.occurrence.phase === 'confirmed'),
    attention: n((r) => r.needsAttention),
    upcoming: n((r) => ['upcoming', 'due', 'snoozed'].includes(r.occurrence.phase)),
  };
}

/** "8:05", "08:05", "805" or "8" => "08:05" / "08:00"; anything else => null. */
export function normalizeTime(input: string): string | null {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(input.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  return h > 23 || min > 59
    ? null
    : `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export interface TodayResponse {
  now: string;
  occurrences: OccurrenceView[];
}
