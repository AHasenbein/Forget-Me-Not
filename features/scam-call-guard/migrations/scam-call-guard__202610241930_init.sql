-- scam-call-guard: one row per phone call session. Holds IDs, enums, timestamps and the length-capped AI overview ONLY:
-- NO transcript, NO caller number, NO audio. RLS is ON with no client policies: anon/authenticated roles are denied
-- everything. Only the API (service role) reads and writes, after enforcing role + patient link.

create table if not exists scam_call_guard_calls (
  id uuid primary key,
  patient_id uuid not null,
  started_at timestamptz not null,
  last_segment_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('active', 'ended')),
  last_seq integer not null default -1,
  total_chars integer not null default 0,
  signals text[] not null default '{}',
  level text not null default 'none' check (level in ('none', 'caution', 'danger')),
  ai_verdict text check (ai_verdict in ('scam', 'not_scam', 'unclear', 'unparsed')),
  ai_confidence real,
  summary text check (char_length(summary) <= 600),
  needs_review boolean not null default false,
  alerted_level text not null default 'none',
  notified_level text not null default 'none',
  push_attempts integer not null default 0,
  last_push_at timestamptz,
  review text check (review in ('confirmed_scam', 'false_alarm')),
  reviewed_by uuid,
  reviewed_at timestamptz
);
-- At most one active call per patient: makes repeated start taps idempotent even across API instances.
create unique index if not exists scam_call_guard_calls_one_active
  on scam_call_guard_calls (patient_id) where status = 'active';
alter table scam_call_guard_calls enable row level security;

-- Audit log: every caregiver read of a call overview. Visible to the primary caregiver.
create table if not exists scam_call_guard_views (
  id bigserial primary key,
  call_id uuid not null,
  patient_id uuid not null,
  viewer_id uuid not null,
  at timestamptz not null default now()
);
alter table scam_call_guard_views enable row level security;
