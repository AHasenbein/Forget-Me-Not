# reminders

Read the root `CLAUDE.md` first. Stay inside `features/reminders/`.

## Purpose

Daily reminders for the patient: **pill, brush teeth, shower, feed pets**. The primary caregiver sets the
schedules; the patient confirms with ONE tap. Unconfirmed => the caregiver is alerted (`caregiver.alert`).
Circle members have no access at all. **Not built yet:** video confirmation of pills (computer vision).

## Public interface

- Routes under `/api/reminders` (patient = P, caregiver = C):
  `GET /today` (P,C) · `GET /schedules` (P,C) · `POST /schedules` (C) · `PATCH|DELETE /schedules/:id` (C) ·
  `POST /occurrences/:id/confirm` (P,C) · `POST /occurrences/:id/snooze` (P).
- `index.ts` exports what a job runner / cross-feature tests may use. Status codes come from `HttpError`:
  404 `not_found` (also for another patient's ids), 403 `forbidden`/`not_linked`, 409 `too_early`, `too_soon`,
  `snooze_limit`, `not_due`, `overdue`, `expired_ask_caregiver`, `skipped`, `too_many`.

## Rules baked in (don't weaken)

- Timeline per occurrence: prompt at due, again at +15 min, caregiver alert at +30 min (+10 per snooze). Max 2 snoozes.
- **Double-dose**: confirm is idempotent; two pills can never be confirmed within 2h (`too_soon`); a pill due right after
  a confirmed one is `skipped`, never prompted; after the alert the PATIENT can't confirm a pill (`expired_ask_caregiver`),
  only the caregiver can ("I gave it"). No catch-up doses are ever scheduled.
- One occurrence per schedule per LOCAL day (`scheduleId:YYYY-MM-DD`): DST can't create two. Spring-forward gap => shifted
  forward; fall-back overlap => first occurrence. A schedule created after today's time doesn't alert for today.
- Paused schedules (asleep / in hospital) neither prompt nor alert. No free-text labels (medication names are health data).
- Events carry IDs/enums only (`reasonCode: 'reminder_missed'`).

## Data owned

`MemoryStore` (demo only). **No live store yet**: in live mode `getStore()` throws on purpose (no silent data loss).
Next: Supabase tables `reminders_schedules`, `reminders_occurrences` (RLS on, server uses service role), migration
`reminders__YYYYMMDDHHmm_init.sql`.

## Demo data

`demoSeed` creates Margaret's pill 08:00, brush teeth 08:30, feed pets 17:00 (shared world) and shower 19:00 (local).
Try it: `npm run dev:api:demo`, then call with `Authorization: Bearer demo:caregiver` (or `demo:patient`).

## Events

- Emits: `caregiver.alert` (severity `urgent` for pills, `warning` otherwise)
- Consumes: none

## Open items / decisions for later

- **Nothing runs `sweep()` yet.** It must be called every minute by a job (Supabase cron / edge function) with
  server-side time. Don't call it from request handlers, and don't start a timer inside the feature.
- Video pill confirmation: `Confirmation.method: 'video'` and `verification` states are already modelled; low-confidence
  results must go to caregiver review (root rules).
- Patient screen (one huge button) and caregiver schedule editor: need the app shell to render feature screens.
- Missed-reminder push to the caregiver is delivered by the notifications feature (stand-in in the cross-feature test).

## Test checklist (Definition of Done)

- [x] Happy path · [x] Edge cases (DST, snooze abuse, double-dose, late sweep, paused, created-after-due)
- [x] Authz: unauthenticated, wrong role, circle member (even with grant), cross-patient 404, unlinked
- [x] Cross-feature: `tests/integration/cross-feature/reminders-escalation.test.ts`
- [x] Flag off => inert · [x] `demoSeed` works in demo mode, live mode fails loud
- [ ] Contract tests: n/a until the notifications consumer exists
