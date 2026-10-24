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

## Later PRs

PR 2: device tracker (5-minute throttle, offline queue, expo-location behind an injected source).
PR 3: caregiver map screen ("last seen", "Demo data" badge).
