-- lost-button: one row per "I'm lost" press. Holds IDs, enums and timestamps only: NO coordinates, NO free text.
-- RLS is ON with no client policies: anon/authenticated roles are denied everything. Only the API (service role)
-- reads and writes, after enforcing role + patient link. Add policies deliberately later.

create table if not exists lost_button_alerts (
  id uuid primary key,
  patient_id uuid not null,
  created_at timestamptz not null default now(),
  status text not null check (status in ('active', 'acknowledged', 'resolved', 'expired')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  delivered boolean not null default false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz
);
-- At most one open alert per patient: makes repeated presses idempotent even across API instances.
create unique index if not exists lost_button_alerts_one_open
  on lost_button_alerts (patient_id) where status in ('active', 'acknowledged');
alter table lost_button_alerts enable row level security;
