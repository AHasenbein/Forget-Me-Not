-- profiles: who each signed-in user is (role, linked patient, circle grants). SERVER-ONLY.
-- Signups are open on the project, so "no row here = no access" is what keeps strangers out.
-- RLS ON with NO policies and no grants to anon/authenticated: a client can never read this table
-- (it would leak users) or write it (it would let someone make themselves a caregiver of any patient).
-- Never derive roles from auth user_metadata: users can edit that themselves.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text   not null check (role in ('patient', 'primary_caregiver', 'circle_member')),
  patient_id text,                                   -- the patient this user belongs to (a patient's own user id for patients)
  grants     text[] not null default '{}',           -- circle permissions, only meaningful for circle_member
  created_at timestamptz not null default now()
);
create index if not exists profiles_patient_idx on public.profiles (patient_id);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
