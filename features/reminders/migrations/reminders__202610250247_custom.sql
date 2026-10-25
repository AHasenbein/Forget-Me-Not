-- reminders: custom reminders. A `custom` schedule carries the caregiver's own short words (`label`, max 40 chars),
-- copied onto each day's occurrence. The label is shown on screen only: never pushed, emitted or logged.
-- RLS stays ON with no policies (see the init migration): only the API touches these columns.

alter table public.reminders_schedules drop constraint if exists reminders_schedules_kind_check;
alter table public.reminders_schedules
  add constraint reminders_schedules_kind_check
  check (kind in ('pill', 'brush_teeth', 'shower', 'feed_pets', 'custom'));

alter table public.reminders_schedules   add column if not exists label text check (char_length(label) <= 40);
alter table public.reminders_occurrences add column if not exists label text check (char_length(label) <= 40);

-- A custom reminder must have words; the built-in kinds never do.
-- (Named apart from the auto-named length check `reminders_schedules_label_check` above.)
alter table public.reminders_schedules drop constraint if exists reminders_schedules_custom_label_check;
alter table public.reminders_schedules
  add constraint reminders_schedules_custom_label_check
  check ((kind = 'custom') = (label is not null));
