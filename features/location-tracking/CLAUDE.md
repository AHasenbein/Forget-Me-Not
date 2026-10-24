# location-tracking (R2)

Read the root `CLAUDE.md` first. Stay inside `features/location-tracking/`.

## Purpose

Single owner of patient location data. The patient's device reports its position about every 5 minutes; the
primary caregiver (and circle members with an explicit `view_location` grant) can see the last known position,
always labelled "last seen" when it is stale. Other features (R3 `lost-button`, friends-family) read location
ONLY through `LocationReadContract`.

## Public interface

Routes (`/api/location-tracking`):

- `POST /readings` (patient): batch of readings (offline queue flush). `patientId` comes from the session, never the body.
- `GET /location` (primary_caregiver, circle_member with `view_location`): `{ location: LocationReading | null }`.
  Handlers cannot return 403/404 (core limitation), so unlinked or ungranted callers get `{ location: null }`.
- `GET /views` (primary_caregiver): audit log of who viewed the location and when (no coordinates).

Contract: implements `LocationReadContract` (`server/service.ts`, `createLocationService`). Not yet registered
with `registerLive('location', ...)`: that is a separate `chore/core/` PR.

## Data owned

`location_tracking_last_known` (latest reading per patient only, data minimisation) and
`location_tracking_view_audit`. RLS on with no client policies: only the server (service role) touches them.
Until the Supabase adapter lands, the in-memory store in `server/store.ts` is the only store.

## Demo data

`demoSeed` loads Margaret's last known position (2 minutes ago, from `DemoWorld`), registers who may read it
(patient, caregiver, daughter; NOT the friend) and one earlier "daughter viewed" audit row. Run with
`DATA_MODE=demo FEATURE_ALL=on`; use `demo:caregiver` and `demo:friend` tokens to show the difference.

## Events

- Emits: none yet (`safezone.crossed` arrives with native geofencing in a later PR).
- Consumes: none.

## Edge cases (from the root checklist, plus feature-specific)

- Reports every `REPORT_INTERVAL_MS` (5 min). Stale after 3 missed intervals (`STALE_AFTER_MS`), computed on the
  server from its own clock. The client-sent value is never trusted. UI must say "last seen X ago", never "now".
- Out-of-order offline flush: last known is the latest `recordedAt`, not the last one received.
- Future-dated readings (clock skew / spoofing) are rejected; bad coordinates are a 400.
- Unlinked or ungranted caller: no coordinates in the response. Denied contract reads are audited too.
- OS-killed background task / GPS denied: no reading arrives, so the reading goes stale. Absence of updates is
  NEVER proof the patient is safe.
- Never log coordinates.

## Test checklist (Definition of Done)

- [x] Happy path
- [x] Edge cases (above)
- [x] Authz: unauthenticated, wrong role, cross-user, circle member without grant
- [x] Contract tests for `LocationReadContract`
- [ ] Cross-feature test (`tests/integration/cross-feature/`): arrives with R3
- [x] Flag off => feature inert
- [x] `demoSeed` implemented; works end-to-end in demo mode

## Device tracker (`tracker/`)

- `tracker.ts` (pure, unit-tested): throttles OS fixes to one per `REPORT_INTERVAL_MS`, queues offline (bounded to ~24h,
  persisted), uploads oldest first in batches of at most `MAX_BATCH`, single-flight. Mocked/invalid fixes are ignored;
  future device timestamps are clamped to now. A server 400 drops that batch (it would block the queue forever);
  401/403 keeps the data and reports `signed_out` (no confusing logout); network errors keep it and report `offline`.
- `http.ts`: uploader for `POST /readings`. `expo.ts`: expo-location + TaskManager adapter (`createDeviceTracker`,
  `startTracking`, `stopTracking`, `ensurePermissions`). `timeInterval` is Android-only, so the 5-minute cadence is
  enforced in the tracker, not by the OS. iOS needs the user to grant "Always"; with "When in use" the tracker only runs
  in the foreground.
- **Not verified on a real device yet** (dev build required). **Not wired into the app yet:** `TaskManager.defineTask` must
  run at app start, so the app root (shell, shared) must import `tracker/expo.ts` and call `startTracking` after patient
  login; do that in a separate shell change agreed with the other dev.

## Later PRs

PR 3: caregiver map screen ("last seen", "Demo data" badge) and the patient "sharing your location" status.
