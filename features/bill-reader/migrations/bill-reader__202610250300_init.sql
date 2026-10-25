-- bill-reader: the FACTS read from a bill the patient showed. The picture is never stored.
-- RLS is ON with no client policies: anon/authenticated roles are denied everything. Only the API (service role)
-- reads and writes, after enforcing role + patient link. Add policies deliberately later.

create table if not exists bill_reader_scans (
  id uuid primary key,
  patient_id uuid not null,
  created_at timestamptz not null default now(),
  outcome text not null check (outcome in ('read', 'flagged', 'unclear')),
  utility text not null check (utility in ('electric','water','gas','phone','internet','insurance','rent','medical','tax','credit_card','other')),
  payee text not null default '' check (char_length(payee) <= 40),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  due_date date,
  red_flags text[] not null default '{}',
  confidence real not null check (confidence >= 0 and confidence <= 1),
  source text not null check (source in ('ai', 'sample'))
);
create index if not exists bill_reader_scans_patient_created on bill_reader_scans (patient_id, created_at desc);
alter table bill_reader_scans enable row level security;
