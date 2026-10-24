import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEntry, Frame, Occurrence, Schedule } from './schemas';
import type { OccurrenceExpect, ReminderStore } from './store';

/**
 * Postgres-backed store (service role; see core/db). Transitions are single `UPDATE ... WHERE` statements,
 * so they are atomic in the database even with several API processes.
 */
const S = 'reminders_schedules';
const O = 'reminders_occurrences';
const F = 'reminders_frames';
const A = 'reminders_audit';

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
    if (expect.verification) q = q.in('confirmation->>verification', [...expect.verification]);
    const rows = rowsOf(await q.select('*'));
    return rows[0] ? occurrenceFromRow(rows[0]) : null;
  };

  deleteOccurrence = async (id: string) => void check(await this.db.from(O).delete().eq('id', id));

  putFrames = async (frames: Frame[]) =>
    void check(
      await this.db.from(F).insert(
        frames.map((f) => ({
          id: f.id,
          occurrence_id: f.occurrenceId,
          patient_id: f.patientId,
          media_type: f.mediaType,
          data: f.data,
          created_at: f.createdAt,
        })),
      ),
    );
  getFrames = async (occurrenceId: string) =>
    rowsOf(
      await this.db.from(F).select('*').eq('occurrence_id', occurrenceId).order('created_at'),
    ).map((r): Frame => ({
      id: r.id as string,
      occurrenceId: r.occurrence_id as string,
      patientId: r.patient_id as string,
      mediaType: r.media_type as Frame['mediaType'],
      data: r.data as string,
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  deleteFrames = async (occurrenceId: string) =>
    void check(await this.db.from(F).delete().eq('occurrence_id', occurrenceId));
  deleteFramesOlderThan = async (iso: string) =>
    rowsOf(await this.db.from(F).delete().lt('created_at', iso).select('id')).length;

  addAudit = async (e: AuditEntry) =>
    void check(
      await this.db.from(A).insert({
        id: e.id,
        at: e.at,
        actor_id: e.actorId,
        patient_id: e.patientId,
        action: e.action,
        occurrence_id: e.occurrenceId,
      }),
    );
  listAudit = async (patientId: string, limit: number) =>
    rowsOf(
      await this.db
        .from(A)
        .select('*')
        .eq('patient_id', patientId)
        .order('at', { ascending: false })
        .limit(limit),
    ).map((r): AuditEntry => ({
      id: r.id as string,
      at: new Date(r.at as string).toISOString(),
      actorId: r.actor_id as string,
      patientId: r.patient_id as string,
      action: r.action as AuditEntry['action'],
      occurrenceId: r.occurrence_id as string,
    }));
}
