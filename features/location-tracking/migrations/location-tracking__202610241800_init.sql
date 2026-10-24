-- location-tracking: latest position per patient (data minimisation: no history) and a view audit log.
-- RLS is ON with no client policies: anon/authenticated roles are denied everything. Only the API
-- (service role) reads and writes, after enforcing role + circle grant. Add policies deliberately later.

create table if not exists location_tracking_last_known (
  patient_id uuid primary key,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision not null check (accuracy_m >= 0),
  source text not null check (source in ('gps', 'network', 'manual')),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);
alter table location_tracking_last_known enable row level security;

-- Never stores coordinates. Visible to the primary caregiver via the API.
create table if not exists location_tracking_view_audit (
  id uuid primary key,
  patient_id uuid not null,
  requester_id uuid not null,
  purpose text not null check (purpose in ('circle_view', 'caregiver_view', 'lost_button', 'safezone_eval')),
  outcome text not null check (outcome in ('served', 'no_data', 'denied')),
  at timestamptz not null default now()
);
create index if not exists location_tracking_view_audit_patient_at
  on location_tracking_view_audit (patient_id, at desc);
alter table location_tracking_view_audit enable row level security;
