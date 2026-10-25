-- good-news: the caregiver's note shown on the first page of the patient's morning paper. One row per patient (a new
-- note replaces the old one). Stories are NOT stored: they are read from public feeds and cached in memory.
-- RLS is ON with no client policies: only the API (service role) reads and writes, after role + patient checks.

create table if not exists good_news_messages (
  patient_id uuid primary key,
  text text not null check (char_length(text) between 1 and 500),
  written_by uuid not null,
  written_at timestamptz not null default now()
);
alter table good_news_messages enable row level security;
