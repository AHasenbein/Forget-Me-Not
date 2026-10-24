# lost-button (R3)

Read the root `CLAUDE.md` first. Stay inside `features/lost-button/`.

## Purpose

The patient presses "I'm lost". The primary caregiver is notified immediately and keeps being notified until they
acknowledge that they are coming. The caregiver sees the patient's last known location (read through
`LocationReadContract`, R2). Circle members have NO access. This PR is the server side; the patient screen is a separate PR.

## Public interface

Routes under `/api/lost-button` (patient = P, caregiver = C):

- `POST /alerts` (P): the press. Idempotent while an alert is open: repeated taps return the same alert, no second push.
- `GET /alerts/active` (P, C): P gets a status only (`notified | no_one_reachable | on_the_way`), never a location. C gets the
  alert plus `location` (may be `null` or `stale`; the alert is never hidden because of that).
- `POST /alerts/:id/acknowledge` (C): "I'm on my way". Stops the repeat pushes; the patient sees `on_the_way`.
- `POST /alerts/:id/resolve` (C): patient found / safe. Closes the alert.
- `index.ts` exports `createLostButtonService`, `MemoryAlertStore`, constants and `getService` for the job runner and cross-feature tests.
  Status codes via `HttpError`: 403 `not_linked`/`forbidden`, 404 `not_found` (also for another patient's alert), 409 `resolved`/`expired`.

Consumes `LocationReadContract` (via `getProviders().location`, purpose `lost_button`). Emits `caregiver.alert`
(`severity: urgent`, `reasonCode: patient_lost`, once per alert).

## Data owned

`lost_button_alerts` (RLS on, no client policies). **No coordinates are stored here, anywhere**: not in the table, the push or the
event. Location is looked up when the caregiver views the alert, so R2 audit-logs that read.
In-memory store only for now; outside demo mode the store and caregiver lookup throw instead of silently using memory.

## Demo data

`demoSeed` registers the demo caregiver for Margaret. Press as `demo:patient`, view as `demo:caregiver` (sees the park location),
try `demo:daughter` (403: circle members cannot see or act on lost alerts). Run with `DATA_MODE=demo FEATURE_ALL=on`.

## Rules baked in (don't weaken)

- The patient can NOT cancel an alert: a confused patient cancelling a real one is the worse failure. Only the caregiver resolves.
- Pushes: first attempt inside the press (failure never fails the press), then `sweep()` repeats every 2 min for the first 5
  pushes, then every 10 min, until acknowledged, resolved or 24h (`ALERT_TTL_MS`). Caregivers are looked up on every attempt, so an
  unlinked caregiver stops receiving. The patient is told `no_one_reachable`, never "we told your caregiver", unless a push was delivered.
- Push body is generic and carries only the alert id. Never put a name, place or coordinates in it.
- A press after an acknowledged-but-unresolved alert returns the same alert (`on_the_way`); the caregiver resolves it.

## Needs a job runner (not built yet)

`getService().sweep()` must run about every minute on the server (same gap as reminders). Until then only the first push fires.
The location shown can be up to 5 minutes old (or stale): R2 is the single owner, so R3 cannot ask the phone for a fresher fix.

## Edge cases (from the root checklist)

accidental/repeated "lost" presses (idempotent, concurrent-safe) · caregiver unreachable (repeat pushes, `no_one_reachable`) ·
caregiver revocation/unlinking (fresh lookup per attempt) · stale or missing location (alert still shown) · multiple caregivers
(all notified, first to acknowledge stops everyone) · notifier failure (retried on the next sweep) · session expiry (patient 401 is
the UI's job to handle gently).

## Test checklist (Definition of Done)

- [x] Happy path
- [x] Edge cases (above)
- [x] Authz: unauthenticated, wrong role, cross-user, circle member (even with `view_location`), unlinked
- [x] Contract: consumes `LocationReadContract`
- [x] Cross-feature test (`tests/integration/cross-feature/lost-button-location.test.ts`) with R2's real service
- [x] Flag off => feature inert
- [x] `demoSeed` implemented; works end-to-end in demo mode
