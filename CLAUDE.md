# Forget Me Not

App for people with dementia and their caregivers, family and friends. Users are vulnerable and data is
health-adjacent (location, medication, finances, calls). **Safety and dignity beat features and speed.**
24h hackathon, two developers: keep PRs small and stay inside your feature folder.

## Roles

- **Patient**: elderly UI, huge buttons, minimal text, high contrast, ONE primary action per screen.
- **Primary caregiver**: dashboard, approvals (gift cards etc.), full visibility, escalation target.
- **Circle member (family/friend)**: limited, patient-consented. Send/receive check-ins, see location ONLY if
  granted, receive safe-zone alerts. Can NEVER approve purchases or change settings.

## Stack (decided; do not relitigate)

Expo (React Native, TypeScript, Expo Router) + Supabase (Auth, Postgres+RLS, Realtime, Storage) + Hono API
in `core/server` (Supabase Edge Function / Node). Rejected: Flutter+Firebase (comparable native support, but
weaker SQL/RLS for role+circle permissions, and no TS sharing with the API).

1. **Location**: `expo-location` foreground + background task (`expo-task-manager`), written to Supabase.
2. **Geofencing**: native `Location.startGeofencingAsync` (iOS/Android region monitoring, survives app kill) for
   safe zones; the location-tracking owner debounces events to stop boundary flapping.
3. **Push**: `expo-notifications` (APNs/FCM via Expo push) sent from the server; Supabase Realtime for live updates.
4. **Testability**: every port (location, push/SMS, AI, Plaid, clock) has a mock in `core/testing`; no keys needed.
5. **Deploy**: `eas update` (OTA JS) + `supabase db push` + edge function deploy. Native changes need a new EAS build.

### Known limits (read before hour 20)

- **Expo Go cannot do this app.** Background location, geofencing and reliable push need a **dev build**
  (`eas build --profile development`). Build one in the first hours, not the last.
- **iOS**: background location needs "Always" permission (user must upgrade from "When In Use"); the OS may
  suspend or terminate the app, so treat background updates as best-effort and never as proof of absence.
  Region monitoring: max 20 geofences per app, ~100m minimum useful radius, delays of minutes are normal.
- **Android**: background location needs a foreground-service notification; OEM battery savers (Xiaomi, Samsung,
  Huawei) kill tasks. Play Store review requires a background-location justification (not an issue for demos).
- **Push**: iOS simulator cannot receive push; test on a device. Push is not guaranteed delivery: escalation must
  work from server-side timers, not from the patient's phone being awake.
- **Call recording**: iOS does not allow third-party call recording; Android restricts it by version. Scam-call-guard
  must degrade gracefully (user-initiated recording / voicemail / carrier signals). Behind `CALL_RECORDING_ENABLED`.
- Camera/video (`expo-camera`) works in a dev build; large uploads must be resumable and size-limited.
- **Windows + macOS**: both must work. Scripts use cross-env/Node, never bash-only syntax; file paths via `node:path`
  (use `path.posix` for repo-relative strings); LF line endings (`.gitattributes`). iOS can only be built/simulated
  on a Mac (or EAS cloud). CI has a `windows` job.
- No mobile UI e2e in CI yet (Maestro is post-hackathon). API e2e only.
- **API deploy is not wired yet** (Stage 2): bundle `core/server` + manifests into a Supabase Edge Function.
  deploy.yml ships DB migrations + the app (EAS Update) only. The `dev:api` token verifier is a stub (all 401).
- Manifests are bundled into the app via the registry: route handlers must lazy-import server-only code.

## Repo map and architecture rules

```
features/<name>/   one vertical slice: ui, routes, services, models, migrations/, tests/, CLAUDE.md, manifest.ts
features/_template copy source for `npm run new-feature` (not a feature, never imported)
core/              SHARED: auth, db, config, logging, events (bus), notifications, ai, design-system, testing, server, feature-registry
contracts/         SHARED: typed interfaces + event schemas (location-read contract, check-in events, EventMap)
app/               Expo Router shell only (3 one-line files). Real shell code is core/client.
core/client/       app shell: session (demo personas), API client, dashboards, settings. core/clock = app time, core/jobs = background jobs.
tests/             architecture/ (boundary, route-auth), smoke/, e2e/, integration/cross-feature/
```

1. Features NEVER import another feature's internals (`@features/*` is banned in features/, core/, contracts/).
2. Cross-feature communication ONLY via the event bus or `contracts/`. Examples: friends-family reads location only
   through `LocationReadContract`; scam-call-guard emits `caregiver.alert`; payloads hold IDs/enums, never PII.
3. `core/` and `contracts/` change rarely; flag it in the PR (CODEOWNERS requires the other dev).
4. Each feature exposes `manifest.ts` (name, routes, nav, permissions, events, migrations, env). It is
   auto-discovered (server: `discoverManifests`; mobile: generated `registry.generated.ts`, gitignored).
   **Adding a feature never edits a shared router/nav/config file. A feature branch touches only its own folder.**
5. Migrations: `features/<name>/migrations/<name>__<YYYYMMDDHHmm>_<desc>.sql`, tables prefixed `<name_>`, RLS on.
   `npm run sync-migrations` assembles `supabase/migrations/` (generated, gitignored).
6. Env vars: per feature, prefixed `<NAME_UPPER_SNAKE>_`, declared in the manifest, validated at startup, listed in `.env.example`.
7. **UI without touching shared files**: a feature's screens are dashboard widgets in `features/<name>/ui/index.tsx`
   (`defineFeatureUi({ widgets: [{ id, role, order, Component }] })`), auto-registered by `gen-registry` (gitignored
   `ui-registry.generated.ts`). Never import `ui/` from `manifest.ts` (the server must not load React Native). Keep view
   logic in pure `.ts` (unit-testable) and the `.tsx` thin. Build with `core/design-system/components` only.
8. **Time and background work**: read time ONLY from `@core/clock` `now()` (services take `now` as a dependency so tests use
   `FakeClock`). Background work = manifest `jobs` (run by `core/jobs`); never `setInterval` inside a feature or a handler.
9. Feature flags: `FEATURE_<NAME>=on|off`. New features ship `enabledByDefault: false`; off = no routes, no subscriptions (inert).

## Demo vs live data (hackathon demo must always work)

- `DATA_MODE=demo|live` (mobile: `EXPO_PUBLIC_DATA_MODE`). **Default is demo everywhere except production.** Per-service
  override: `DATA_MODE_AI|PLAID|NOTIFIER|LOCATION`. Demo in production needs `ALLOW_DEMO_IN_PRODUCTION=true`.
- **Demo** = one fictional household (`core/demo/world.ts`: Margaret, caregiver, daughter with location grant, friend
  without), mock adapters, no keys, no real person ever contacted. **Live** = real adapters; never silently falls back
  to canned data (`getProviders` throws if a live adapter isn't registered).
- Tests ALWAYS run in demo mode with `core/testing` mocks. Live is only exercised manually / in explicit live tests.
- Features get ports from `getProviders()` (ai, plaid, notifier, location, verifier); **never import a concrete adapter or
  hardcode `if (demo)` branches in feature logic**. Live adapters are registered once via `registerLive()`.
- **Every feature with user-visible data MUST ship `demoSeed` in its manifest** (canned data built from `DemoWorld`,
  idempotent) and work in demo mode end-to-end. Share data across features only through `core/demo/world.ts`; otherwise
  keep it in `features/<name>/demo/`. Canned data is fictional: no real names, numbers, addresses, or documents.
- Demo mode swaps DATA SOURCES only. It never weakens authorization: the same role/circle checks run. Demo tokens
  (`demo:patient | demo:caregiver | demo:daughter | demo:friend`) exist only in demo mode, for instant role switching.
- Canned timestamps are relative to "now" (so "2 minutes ago" is true on stage). Show a small "Demo data" badge on
  caregiver/dev screens (never on patient screens). Never run demo mode against a deployment holding real patient data.
- Demo shortcuts: `npm run dev:api:demo` (API on :8787; the app talks to it over HTTP so patient + caregiver tabs share
  state) and `npm run dev:demo` (app; press `w` for web) turn on every feature with canned data; `dev:*:live` use real data.
- **Demo clock** (Settings > Demo controls; patient/caregiver only; demo mode only, 404 otherwise): speed 1x-600x, skip
  ahead, reset. Seed canned data RELATIVE to demo "now" (first reminder due in 2 min), never at fixed clock times.
  The app shows the server's `now`, not the device clock. Phones: `EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:8787`.

## Commands

```
npm run setup            install + generate registry (one-time)       npm run dev          Expo dev client
npm run dev:demo | dev:live    app with canned / real data            npm run dev:api:demo | dev:api:live
npm run dev:api          local API (tsx watch)                         npm run lint | typecheck | format
npm run unit | integration | e2e | coverage | boundary | test         npm run new-feature <kebab-name>
npm run build            registry + typecheck + web export             npm run sync-migrations
```

## Definition of Done (every feature; tests are written WHILE building, never after)

- Happy path tests; edge-case tests (checklist below); **authorization tests** incl. unauthenticated, wrong role,
  cross-user, cross-role, circle member without grant; contract tests for contracts it implements/consumes;
  cross-feature tests in `tests/integration/cross-feature/` where it touches another feature; flag-off => inert.
- `demoSeed` ships and the feature works in demo mode; no hardcoded demo branches in logic.
- lint + typecheck + tests green. Feature `CLAUDE.md` filled in. No merge without these.

## Security rules

- **Deny by default, server-side.** Every endpoint declares `access`: roles, plus `circlePermission` whenever circle
  members are allowed (core/server enforces both; route-auth test checks it). No IDOR:
  always scope by the caller's linked patient, never trust IDs from the client. RLS on every table.
- Validate all inputs with zod. Secrets only via env. **Never log** PII, tokens, location, or document contents
  (`core/logging` redacts known keys; don't rely on it).
- Media via signed, expiring URLs. Validate upload type and size.
- **Fail closed on money**: gift-card-guard, no approval => no purchase. Neither patient nor circle members can approve.
  Plaid sandbox only.
- **AI output is untrusted.** Documents/emails/calls can contain prompt injection: content can never trigger actions.
  Below `LOW_CONFIDENCE` flag for caregiver review. Never present AI output as medical/legal/financial advice.
- Audit-log sensitive actions: approvals, location views, recording access, circle changes. Primary caregiver can see them.
- Call recording only behind consent/jurisdiction flag (`CALL_RECORDING_ENABLED`, default off).
- **Stalking/abuse defense**: invites are single-use + expiring; patient or primary caregiver can revoke/mute any
  member instantly; location is never shared without explicit per-member grant; every new grant notifies the primary
  caregiver; every location view is audit-logged and visible to the primary caregiver.

## Edge-case checklist (consult before finishing ANY feature)

offline/dead battery · GPS denied/stale/spoofed · OS killed background location · timezone/DST change ·
double-dose risk · snooze abuse · failed or fake video confirmation · caregiver unreachable (escalation + timeouts) ·
multiple caregivers/circle members conflicting · accidental/repeated "lost" presses · missing home address ·
AI hallucination · non-English or malicious documents · distressing email content · scam-call false
positives/negatives · repeated taps and session expiry for confused users · caregiver revocation/unlinking · data deletion.
**friends-family:** missed check-in while patient asleep/in hospital · check-in spam from a member · member removed
mid-escalation · geofence flapping at a boundary · intercepted invite · circle with zero reachable members ·
conflicting permissions between patient and caregiver (most restrictive wins; patient privacy grant can't be widened by a caregiver silently).

## Patient UI rules

Touch targets ≥ 64px (`core/design-system`), font ≥ 24, high contrast, max ONE primary action per screen, plain
language (no jargon, no error codes), confirm destructive actions, tolerate tremor and repeated taps (debounce /
idempotent actions), survive session expiry without a confusing logout. **Check-in = one tap + clear confirmation.**

## Working agreements for Claude

1. Read this file and `features/<name>/CLAUDE.md` before touching a feature. Stay inside your feature folder.
2. **No bash-only commands in scripts, package.json or docs** (Windows dev). **Ask before touching `core/` or `contracts/`.** Never add to `tests/architecture/public-routes.allowlist.ts` without asking.
3. Don't build features outside the one you were asked about; don't import other features.
4. Build against `getProviders()` + demo data first so the feature is demoable from the first commit.
5. Run `npm run lint && npm run typecheck && npm test` before declaring done. Report failures honestly.
6. Small changes, commit often (branch `feat/<feature>/<desc>`), never commit `.env` or secrets.
