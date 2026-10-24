# reminders

Read the root `CLAUDE.md` first. Stay inside `features/reminders/`.

## Purpose

Daily reminders for the patient: **pill, brush teeth, shower, feed pets**. The primary caregiver sets the
schedules; the patient confirms with ONE tap. Unconfirmed => the caregiver is alerted (`caregiver.alert`).
Circle members have no access at all. **Not built yet:** video confirmation of pills (computer vision).

## Public interface

- Routes under `/api/reminders` (patient = P, caregiver = C):
  `GET /today` (P,C; returns `{ now, occurrences }`, `now` = server app time) · `GET /history?days=7` (P,C) · `GET /schedules` (P,C) · `POST /schedules` (C) · `PATCH|DELETE /schedules/:id` (C) ·
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

Tables `reminders_schedules`, `reminders_occurrences` (migration `reminders__202610250002_init.sql`). RLS is ON with no
policies and no grants to anon/authenticated: ONLY the API (service role, `core/db`) reads or writes them.
Store: demo = `MemoryStore` (resets on restart); live = `SupabaseStore`. Every store must pass `store-contract.ts`.
Apply the schema with `npm run db:push` (dry run: `db:push:dry`), prove the anon key sees nothing with `npm run db:probe`,
and run the contract against the real project with `npm run test:store:live`.

## Demo data

`demoSeed` creates Margaret's pill 08:00, brush teeth 08:30, feed pets 17:00 (shared world) and shower 19:00 (local).
Try it: `npm run dev:api:demo`, then call with `Authorization: Bearer demo:caregiver` (or `demo:patient`).

## Events

- Emits: `caregiver.alert` (severity `urgent` for pills, `warning` otherwise)
- Consumes: none

## UI (dashboard widgets, `ui/`)

- **Patient** (`PatientReminders`): ONE card, ONE primary button ("I took it"); snooze is secondary (hidden at the limit);
  a missed pill says "Your caregiver has been told" with no retry; errors are plain words (`ui/model.ts`).
- **Caregiver** (`CaregiverReminders`): counts, "needs attention" cards with "I gave it" / "Mark done", today's list,
  7-day history, schedule list (pause/resume, two-tap delete), add form. Circle members see nothing from this feature.
- `ui/model.ts` holds the logic (unit-tested); the `.tsx` files are thin.

## The clock

`manifest.jobs` runs `sweep()` (prompt at due, again at +15, caregiver alert at +30). `core/jobs` polls the app clock, so
speeding up or skipping demo time fires it immediately. Live: the API process runs it; a Supabase cron is the Stage 2 option.

## Open items / decisions for later

- **Live login** (verifier is still a stub): live mode can store data but nobody can sign in yet.
- Known limit: the "no two pills in 2h" check spans two rows, so two simultaneous confirms of different pills could both
  pass. Closing it needs a Postgres function.
- **No real push**: prompts go to the mock notifier; the patient sees them in the app. `expo-notifications` needs a dev build.
- Video pill confirmation: `Confirmation.method: 'video'` and `verification` states are modelled; low-confidence results
  must go to caregiver review (root rules).
- Patient name is hardcoded as "Margaret" in caregiver copy until a profile exists.
- Missed-reminder delivery to the caregiver belongs to the notifications feature (stand-in in the cross-feature test).

## Test checklist (Definition of Done)

- [x] Happy path · [x] Edge cases (DST, snooze abuse, double-dose, late sweep, paused, created-after-due)
- [x] Authz: unauthenticated, wrong role, circle member (even with grant), cross-patient 404, unlinked
- [x] Cross-feature: `tests/integration/cross-feature/reminders-escalation.test.ts`
- [x] Flag off => inert · [x] `demoSeed` works in demo mode, live mode fails loud
- [ ] Contract tests: n/a until the notifications consumer exists
