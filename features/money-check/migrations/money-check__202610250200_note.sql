-- money-check: the patient may now type what a payment is for (trimmed, <= 200 chars, digit runs redacted by the API).
-- The note is shown only to the caregiver; it never goes into a push, an event or the audit table.
alter table money_check_requests add column if not exists note text check (note is null or char_length(note) <= 200);
alter table money_check_requests drop constraint if exists money_check_requests_kind_check;
alter table money_check_requests
  add constraint money_check_requests_kind_check
  check (kind in ('gift_card', 'bill', 'caller_wants_money', 'described'));
