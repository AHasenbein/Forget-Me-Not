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
- `POST /find` (primary_caregiver) starts a 10-minute "find them" session; `POST /find/stop` (caregiver or patient) ends it at once;
  `GET /find` (caregiver, patient) says whether it is on. The start is audited once (`find_session`); the caregiver's follow-up
  location reads during the session are not, so the "who looked" list stays readable. Circle members can never start one.
  Sessions live in memory and end by the server clock.
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

## UI (`ui/`, dashboard widgets)

- Caregiver widget (order 20, after reminders): "Location" card. The location is NOT read when the dashboard opens: every read
  is audit-logged, so it is read only on "Show last location" / "Refresh". Shows "Last seen at <time> (within about N m)",
  never "now"; stale or missing location is shown in warning colour with "no update never means they are safe".
  "Open in Maps" is a user-initiated link (no third-party map tiles are fetched, so the area is not leaked).
- "Who looked recently": last 5 rows of `GET /views` in plain words (Caregiver / Family member / Lost-button alert; blocked
  attempts in red). Never shows ids or coordinates.
- Patient widget (order 90, `PatientLocationSharing`): starts the tracker when the patient dashboard mounts (no shell change needed) and shows
  its real state (finding / working / turned off / cannot find). Web uses `tracker/web.ts` (`navigator.geolocation`, i.e. Google's
  location service in Chrome, foreground only, tab must stay open); phones use `tracker/expo.ts` (dev build, still unverified on a device).

## Later PRs

- Wire the device tracker into the app shell (shared change, agree with the other dev; needs a dev build).
- Patient "sharing your location" status once the tracker runs.
- A map view: needs a decision on a tile provider (privacy: tiles reveal the area) or a native map SDK (new EAS build).

## Find them (precise + arrow)

- Patient widget polls `GET /find` every 5 s. While a session is on it says "Your family is finding you." with a "Stop sharing"
  button, and (web) switches to high-accuracy reports about every 3 s (`createFastWebTracker`, in memory only, nothing queued).
  Back to the 5-minute cadence when it ends. Native phones are told but do not yet switch to precise mode (needs a dev build).
- Caregiver `FindThem` (inside the Location card): own position + compass stay on the caregiver's device and are never sent.
  `ui/find.ts` (pure, tested) gives distance, bearing and the arrow rotation. With no compass the arrow points north and the
  words say "Head north-east". Inside the combined GPS uncertainty it says "very close, look around" instead of a false arrow.
- Compass: iOS needs a tap for motion permission (done in the Find button); desktop browsers have none. Needs HTTPS on phones
  for geolocation/compass (localhost is fine on the same machine; a LAN IP over http is not).
- Edge cases: stale patient position is shown with its age; patient revokes at any time; session expiry ends it server-side.
