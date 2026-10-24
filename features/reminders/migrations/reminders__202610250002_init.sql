-- reminders: schedules + occurrences. Only the API (service role) touches these.
-- RLS is ON with NO policies, and anon/authenticated have no grants: the public anon key can do nothing.

create table if not exists public.reminders_schedules (
  id            text primary key,
  patient_id    text        not null,
  kind          text        not null check (kind in ('pill', 'brush_teeth', 'shower', 'feed_pets')),
  local_time    text        not null check (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days_of_week  integer[]   not null,
  time_zone     text        not null,
  escalate      boolean     not null default true,
  paused        boolean     not null default false,
  created_by    text        not null,
  active_from   timestamptz not null
);
create index if not exists reminders_schedules_patient_idx on public.reminders_schedules (patient_id);

create table if not exists public.reminders_occurrences (
  id             text primary key,            -- '<scheduleId>:<local date>': one per schedule per local day
  schedule_id    text        not null,
  patient_id     text        not null,
  kind           text        not null,
  local_date     text        not null,
  time_zone      text        not null,
  due_at         timestamptz not null,
  status         text        not null default 'pending' check (status in ('pending', 'confirmed', 'missed', 'skipped')),
  snooze_count   integer     not null default 0,
  snoozed_until  timestamptz,
  nudges         integer     not null default 0,
  missed_at      timestamptz,
  confirmation   jsonb
);
create index if not exists reminders_occurrences_patient_due_idx on public.reminders_occurrences (patient_id, due_at);
create index if not exists reminders_occurrences_pending_idx on public.reminders_occurrences (status) where status = 'pending';

alter table public.reminders_schedules   enable row level security;
alter table public.reminders_occurrences enable row level security;
revoke all on table public.reminders_schedules   from anon, authenticated;
revoke all on table public.reminders_occurrences from anon, authenticated;
