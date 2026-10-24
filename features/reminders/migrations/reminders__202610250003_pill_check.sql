-- reminders pill check: photos kept ONLY while a caregiver must review them, plus an audit log of who looked.
-- Same rule as every table: RLS on, no policies, no grants to anon/authenticated (the API alone uses these).

create table if not exists public.reminders_frames (
  id            text primary key,
  occurrence_id text        not null,
  patient_id    text        not null,
  media_type    text        not null check (media_type in ('image/jpeg', 'image/png', 'image/webp')),
  data          text        not null,          -- base64; short-lived (deleted on review or after the retention window)
  created_at    timestamptz not null default now()
);
create index if not exists reminders_frames_occurrence_idx on public.reminders_frames (occurrence_id);
create index if not exists reminders_frames_created_idx on public.reminders_frames (created_at);

create table if not exists public.reminders_audit (
  id            text primary key,
  at            timestamptz not null default now(),
  actor_id      text        not null,
  patient_id    text        not null,
  action        text        not null check (action in ('pill_frames_viewed', 'pill_check_reviewed')),
  occurrence_id text        not null
);
create index if not exists reminders_audit_patient_idx on public.reminders_audit (patient_id, at desc);

alter table public.reminders_frames enable row level security;
alter table public.reminders_audit  enable row level security;
revoke all on table public.reminders_frames from anon, authenticated;
revoke all on table public.reminders_audit  from anon, authenticated;
