import type { SupabaseClient } from '@supabase/supabase-js';
import type { Occurrence, Schedule } from './schemas';
import type { OccurrenceExpect, ReminderStore } from './store';

/**
 * Postgres-backed store (service role; see core/db). Transitions are single `UPDATE ... WHERE` statements,
 * so they are atomic in the database even with several API processes.
 */
const S = 'reminders_schedules';
const O = 'reminders_occurrences';

type Row = Record<string, unknown>;

const scheduleFromRow = (r: Row): Schedule => ({
  id: r.id as string,
  patientId: r.patient_id as string,
  kind: r.kind as Schedule['kind'],
  localTime: r.local_time as string,
  daysOfWeek: r.days_of_week as number[],
  timeZone: r.time_zone as string,
  escalate: r.escalate as boolean,
  paused: r.paused as boolean,
  createdBy: r.created_by as string,
  activeFrom: new Date(r.active_from as string).toISOString(),
});
const scheduleToRow = (s: Schedule): Row => ({
  id: s.id,
  patient_id: s.patientId,
  kind: s.kind,
  local_time: s.localTime,
  days_of_week: s.daysOfWeek,
  time_zone: s.timeZone,
  escalate: s.escalate,
  paused: s.paused,
  created_by: s.createdBy,
  active_from: s.activeFrom,
});

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const occurrenceFromRow = (r: Row): Occurrence => ({
  id: r.id as string,
  scheduleId: r.schedule_id as string,
  patientId: r.patient_id as string,
  kind: r.kind as Occurrence['kind'],
  localDate: r.local_date as string,
  timeZone: r.time_zone as string,
  dueAt: iso(r.due_at)!,
  status: r.status as Occurrence['status'],
  snoozeCount: r.snooze_count as number,
  snoozedUntil: iso(r.snoozed_until),
  nudges: r.nudges as number,
  missedAt: iso(r.missed_at),
  confirmation: (r.confirmation as Occurrence['confirmation']) ?? null,
});
const occurrenceToRow = (o: Partial<Occurrence>): Row => {
  const m: Record<string, string> = {
    id: 'id',
    scheduleId: 'schedule_id',
    patientId: 'patient_id',
    kind: 'kind',
    localDate: 'local_date',
    timeZone: 'time_zone',
    dueAt: 'due_at',
    status: 'status',
    snoozeCount: 'snooze_count',
    snoozedUntil: 'snoozed_until',
    nudges: 'nudges',
    missedAt: 'missed_at',
    confirmation: 'confirmation',
  };
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [m[k]!, v]));
};

function check<T>(res: { data: T; error: { message: string } | null }): T {
  // Never include row data in the message (it can hold health information).
  if (res.error) throw new Error(`reminders store: ${res.error.message}`);
  return res.data;
}

const rowsOf = (res: { data: Row[] | null; error: { message: string } | null }): Row[] =>
  check(res) ?? [];

export class SupabaseStore implements ReminderStore {
  constructor(private readonly db: SupabaseClient) {}

  listSchedules = async (patientId: string) =>
    rowsOf(await this.db.from(S).select('*').eq('patient_id', patientId)).map(scheduleFromRow);
  allSchedules = async () => rowsOf(await this.db.from(S).select('*')).map(scheduleFromRow);
  getSchedule = async (id: string) => {
    const r = check(await this.db.from(S).select('*').eq('id', id).maybeSingle());
    return r ? scheduleFromRow(r) : undefined;
  };
  putSchedule = async (s: Schedule) => void check(await this.db.from(S).upsert(scheduleToRow(s)));
  deleteSchedule = async (id: string) => void check(await this.db.from(S).delete().eq('id', id));

  listOccurrences = async (patientId: string) =>
    rowsOf(await this.db.from(O).select('*').eq('patient_id', patientId)).map(occurrenceFromRow);
  pendingOccurrences = async () =>
    rowsOf(await this.db.from(O).select('*').eq('status', 'pending')).map(occurrenceFromRow);
  getOccurrence = async (id: string) => {
    const r = check(await this.db.from(O).select('*').eq('id', id).maybeSingle());
    return r ? occurrenceFromRow(r) : undefined;
  };

  insertOccurrenceIfAbsent = async (o: Occurrence) => {
    const rows = rowsOf(
      await this.db
        .from(O)
        .upsert(occurrenceToRow(o), { onConflict: 'id', ignoreDuplicates: true })
        .select('id'),
    );
    return rows.length > 0; // ignoreDuplicates returns nothing for an existing row
  };

  updateOccurrenceIf = async (id: string, expect: OccurrenceExpect, patch: Partial<Occurrence>) => {
    let q = this.db.from(O).update(occurrenceToRow(patch)).eq('id', id);
    if (expect.status) q = q.in('status', [...expect.status]);
    if (expect.nudges !== undefined) q = q.eq('nudges', expect.nudges);
    if (expect.snoozeCount !== undefined) q = q.eq('snooze_count', expect.snoozeCount);
    const rows = rowsOf(await q.select('*'));
    return rows[0] ? occurrenceFromRow(rows[0]) : null;
  };

  deleteOccurrence = async (id: string) => void check(await this.db.from(O).delete().eq('id', id));
}
