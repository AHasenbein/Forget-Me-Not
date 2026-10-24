# reminders

Read the root `CLAUDE.md` first. Stay inside `features/reminders/`.

## Purpose

Daily reminders for the patient: **pill, brush teeth, shower, feed pets**. The primary caregiver sets the
schedules; the patient confirms with ONE tap. Unconfirmed => the caregiver is alerted (`caregiver.alert`).
Circle members have no access at all. Pills also get an optional **photo check** (below).

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

## Pill photo check

After the patient taps "I took it" on a pill, the app offers to take ~4 photos (`ui/PillCamera.tsx`; demo: "Use sample photos").

- **The tap stays the source of truth.** Photos only set `confirmation.verification`; a failed upload, vision outage or bad model
  output means `pending_review`, never a missed alert and never a blocked patient. The patient always ends on "Thank you".
- Result: confident "taken" => `verified` (photos NOT kept). Unclear / low confidence / error => `pending_review`.
  Confident "not taken" => `rejected`. Either of the last two raises ONE `caregiver.alert` (`pill_check_review`, IDs only).
- **Privacy**: photos are stored only while a human must review them; deleted when the caregiver approves, or after
  `FRAME_RETENTION_DAYS` (7) by the `reminders.cleanup-frames` job. Only the caregiver can fetch them (over the API, no public
  URLs), and every view and review is written to `reminders_audit` (`GET /audit`).
- **Model output is untrusted**: strict zod schema `{verdict, confidence}` (extra fields rejected), image bytes sniffed (a
  PNG labelled JPEG, or a script, is refused before any model sees it), at most 5 photos, body size limit before parsing.
  Text inside photos can never trigger anything: the only effect is a verification label.
- Demo: Settings > Demo controls > "Pill photo check" picks what the canned check sees (Clear / Unclear / Not taken).
  Live: `DATA_MODE_VISION=live` + `AI_API_KEY` uses `core/ai/claude-vision.ts` (claude-opus-5-5, structured output).
- Routes: `POST /occurrences/:id/pill-check` (P), `GET /occurrences/:id/frames` (C), `POST /occurrences/:id/review` (C), `GET /audit` (C).

## The clock

`manifest.jobs` runs `sweep()` (prompt at due, again at +15, caregiver alert at +30). `core/jobs` polls the app clock, so
speeding up or skipping demo time fires it immediately. Live: the API process runs it; a Supabase cron is the Stage 2 option.

## Open items / decisions for later

- **Live login** (verifier is still a stub): live mode can store data but nobody can sign in yet.
- Known limit: the "no two pills in 2h" check spans two rows, so two simultaneous confirms of different pills could both
  pass. Closing it needs a Postgres function.
- **No real push**: prompts go to the mock notifier; the patient sees them in the app. `expo-notifications` needs a dev build.
- The live photo check has not been run against the real model (no `AI_API_KEY` yet): only its request/response handling is
  tested with a fake client. Camera needs a secure origin: `localhost` works; a phone browser on `http://<LAN-ip>` does not.
- Patient name is hardcoded as "Margaret" in caregiver copy until a profile exists.
- Missed-reminder delivery to the caregiver belongs to the notifications feature (stand-in in the cross-feature test).

## Test checklist (Definition of Done)

- [x] Happy path · [x] Edge cases (DST, snooze abuse, double-dose, late sweep, paused, created-after-due)
- [x] Authz: unauthenticated, wrong role, circle member (even with grant), cross-patient 404, unlinked
- [x] Cross-feature: `tests/integration/cross-feature/reminders-escalation.test.ts`
- [x] Flag off => inert · [x] `demoSeed` works in demo mode, live mode fails loud
- [ ] Contract tests: n/a until the notifications consumer exists
