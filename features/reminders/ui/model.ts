import type { IconName } from '@core/design-system/tokens';
import type { Attention } from '@core/feature-registry/ui';
import type { Occurrence, ReminderKind } from '../schemas';
import type { Phase } from '../service';

/** What the API returns for an occurrence. */
export type OccurrenceView = Occurrence & { phase: Phase };

export const KIND: Record<
  ReminderKind,
  { icon: IconName; task: string; label: string; done: string }
> = {
  pill: { icon: 'pill', task: 'Time to take your pill', label: 'Pill', done: 'I took it' },
  brush_teeth: {
    icon: 'toothbrush',
    task: 'Time to brush your teeth',
    label: 'Brush teeth',
    done: 'I did it',
  },
  shower: { icon: 'shower', task: 'Time for your shower', label: 'Shower', done: 'I did it' },
  feed_pets: { icon: 'paw', task: 'Time to feed your pets', label: 'Feed pets', done: 'I did it' },
  custom: { icon: 'check', task: 'Time for your reminder', label: 'Custom', done: 'I did it' },
};

/** Short name of a reminder: a custom one shows the caregiver's words ("Water the plants"). */
export const labelOf = (r: { kind: ReminderKind; label?: string }) =>
  r.kind === 'custom' && r.label ? r.label : KIND[r.kind].label;
/** The patient's headline for a reminder that is due now. */
export const taskOf = (r: { kind: ReminderKind; label?: string }) =>
  r.kind === 'custom' && r.label ? r.label : KIND[r.kind].task;

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

export function checkError(code: string): string {
  // The patient always ends on "thank you": a failed photo check is never her problem.
  return code === 'offline'
    ? 'I can’t reach the app right now, but your pill is saved. Thank you!'
    : 'That’s okay. Thank you!';
}

export function caregiverError(code: string): string {
  switch (code) {
    case 'nothing_to_review':
      return 'That was already reviewed.';
    case 'no_frames':
      return 'The photos are no longer stored.';
    case 'offline':
      return 'Can’t reach the server.';
    case 'too_soon':
      return 'Another pill was confirmed less than 2 hours ago. Not confirmed, to avoid a double dose.';
    case 'too_many':
      return 'That’s the most reminders allowed (20).';
    case 'not_found':
      return 'That reminder no longer exists.';
    case 'invalid_input':
      return 'Please check the reminder: use plain words (no links), 2 to 40 letters, and a time like 8:30.';
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
  /** Pill photo check result, for confirmed pills. */
  check: { label: string; tone: RowTone } | null;
  /** The caregiver must look at the photos (unclear or "does not look taken"). */
  needsReview: boolean;
}

export function pillCheckBadge(o: OccurrenceView): { label: string; tone: RowTone } | null {
  if (o.kind !== 'pill' || o.status !== 'confirmed' || !o.confirmation) return null;
  switch (o.confirmation.verification) {
    case 'verified':
      return {
        label: o.confirmation.reviewedBy ? 'Photos approved' : 'Photo check passed',
        tone: 'success',
      };
    case 'pending_review':
      return { label: 'Photos need your review', tone: 'warn' };
    case 'rejected':
      return { label: 'Photos look wrong', tone: 'danger' };
    default:
      return o.confirmation.method === 'tap' ? { label: 'No photo check', tone: 'neutral' } : null;
  }
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
    const check = pillCheckBadge(o);
    const needsReview =
      o.confirmation?.verification === 'pending_review' ||
      o.confirmation?.verification === 'rejected';
    const base = { occurrence: o, needsAttention: false, canMarkDone: false, check, needsReview };
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

/**
 * What the caregiver alerts widget tells the dashboard status line: missed reminders plus pill photos to check.
 * A missed pill, or photos that look wrong, are urgent. `failed` = the last refresh did not get through.
 */
export function attentionReport(rows: readonly CaregiverRow[], failed: boolean): Attention {
  const missed = rows.filter((r) => r.needsAttention);
  const reviews = rows.filter((r) => r.needsReview);
  const urgent =
    missed.some((r) => r.occurrence.kind === 'pill') ||
    reviews.some((r) => r.occurrence.confirmation?.verification === 'rejected');
  const what = [
    missed.length === 1 && missed[0] ? `${labelOf(missed[0].occurrence)} missed` : '',
    missed.length > 1 ? `${missed.length} reminders missed` : '',
    reviews.length ? 'Pill photos to check' : '',
  ].filter(Boolean);
  return {
    count: missed.length + reviews.length,
    severity: urgent ? 'urgent' : 'warning',
    what: what.length ? what.join(' · ') : undefined,
    unknown: failed ? 'reminders' : undefined,
  };
}

export function caregiverCounts(rows: readonly CaregiverRow[]) {
  const n = (f: (r: CaregiverRow) => boolean) => rows.filter(f).length;
  return {
    done: n((r) => r.occurrence.phase === 'confirmed'),
    attention: n((r) => r.needsAttention),
    upcoming: n((r) => ['upcoming', 'due', 'snoozed'].includes(r.occurrence.phase)),
    review: n((r) => r.needsReview),
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

/** "Good morning" / "Good afternoon" / "Good evening" for the SERVER's now (never the device clock). */
export function greetingFor(nowIso: string, timeZone?: string): string {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(
        new Date(nowIso),
      ),
    );
  } catch {
    hour = new Date(nowIso).getHours();
  }
  hour %= 24;
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** "Tuesday, June 2" for the server's now. */
export function dateLabelFor(nowIso: string, timeZone?: string): string {
  const opts = { weekday: 'long', month: 'long', day: 'numeric' } as const;
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(new Date(nowIso));
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(nowIso));
  }
}

/** "in 25 min" / "in 2 h 5 min" / "now" between the server's now and a due time. */
export function untilLabel(nowIso: string, dueIso: string): string {
  const mins = Math.round((new Date(dueIso).getTime() - new Date(nowIso).getTime()) / 60_000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

/** The soonest reminder that has not happened yet (upcoming or snoozed). */
export function nextUp(items: readonly OccurrenceView[]): OccurrenceView | null {
  return (
    [...items].filter((o) => o.phase === 'upcoming' || o.phase === 'snoozed').sort(byDue)[0] ?? null
  );
}

/** Share of reminders taken, as a whole percent. Skipped ones do not count either way. null = no data yet. */
export function adherencePercent(s: { confirmed: number; missed: number }): number | null {
  const total = s.confirmed + s.missed;
  return total === 0 ? null : Math.round((s.confirmed / total) * 100);
}

export interface DayBar {
  key: string;
  label: string;
  done: number;
  missed: number;
  isToday: boolean;
}

/** Last 7 days (oldest first), counted in the given zone, for the adherence strip. */
export function weekStrip(
  items: readonly OccurrenceView[],
  nowIso: string,
  timeZone?: string,
): DayBar[] {
  const key = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const label = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
  const now = new Date(nowIso);
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() - (6 - i) * 86_400_000));
  return days.map((d, i) => {
    const k = key(d);
    const mine = items.filter((o) => key(new Date(o.dueAt)) === k);
    return {
      key: k,
      label: label(d),
      done: mine.filter((o) => o.phase === 'confirmed').length,
      missed: mine.filter((o) => o.phase === 'missed' || o.phase === 'overdue').length,
      isToday: i === 6,
    };
  });
}

export const AUDIT_LABEL: Record<string, string> = {
  pill_frames_viewed: 'Pill photos were viewed',
  pill_check_reviewed: 'A pill photo check was reviewed',
};
export const auditLabel = (action: string) => AUDIT_LABEL[action] ?? 'Activity recorded';

const BY_ANOTHER: Record<string, string> = {
  pill_frames_viewed: 'Another caregiver viewed pill photos',
  pill_check_reviewed: 'Another caregiver reviewed a pill photo check',
};

/**
 * "Worth knowing" lines: only caregivers can open pill photos, so the one thing worth telling you is that ANOTHER
 * caregiver did. Your own views stay in the full record. Rows come newest first; repeats are grouped.
 */
export function photoWorthKnowing(
  rows: readonly { action: string; at: string; byYou?: boolean }[],
) {
  const groups = new Map<string, { action: string; text: string; count: number; lastAt: string }>();
  for (const r of rows) {
    if (r.byYou) continue;
    const g = groups.get(r.action);
    if (g) g.count++;
    else
      groups.set(r.action, {
        action: r.action,
        text: BY_ANOTHER[r.action] ?? 'Another caregiver did something with pill photos',
        count: 1,
        lastAt: r.at,
      });
  }
  return [...groups.values()];
}
