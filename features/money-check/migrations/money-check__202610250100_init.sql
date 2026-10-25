-- money-check: one row per "may I pay this?" request. Holds IDs, enums and timestamps only: NO payee, NO amount,
-- NO free text (a bill is referenced by its id and looked up when the caregiver views it).
-- RLS is ON with no client policies: anon/authenticated roles are denied everything. Only the API (service role)
-- reads and writes, after enforcing role + patient link. Add policies deliberately later.

create table if not exists money_check_requests (
  id uuid primary key,
  patient_id uuid not null,
  kind text not null check (kind in ('gift_card', 'bill', 'caller_wants_money')),
  level text not null check (level in ('stop', 'check', 'ok')),
  reasons text[] not null default '{}',
  bill_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null check (status in ('pending', 'approved', 'declined')),
  delivered boolean not null default false,
  decided_by uuid, -- null on a decided row means it expired (fail closed => declined)
  decided_at timestamptz
);
-- At most one open request per patient: makes repeated taps idempotent even across API instances.
create unique index if not exists money_check_requests_one_open
  on money_check_requests (patient_id) where status = 'pending';
alter table money_check_requests enable row level security;

-- Who asked and who decided. Caregiver-visible via GET /audit.
create table if not exists money_check_audit (
  id bigint generated always as identity primary key,
  patient_id uuid not null,
  request_id uuid not null,
  action text not null check (action in ('created', 'approved', 'declined', 'expired')),
  by_id uuid,
  at timestamptz not null default now()
);
alter table money_check_audit enable row level security;
