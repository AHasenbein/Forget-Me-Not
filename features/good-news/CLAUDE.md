# good-news (morning paper)

Read the root `CLAUDE.md` first. Stay inside `features/good-news/`.

## Purpose

The first thing the patient sees each day is a short "newspaper": page 1 is a message from the primary caregiver (if they
left one in the last 24 hours), then one gentle good-news story per page. The patient can go back, continue later (it
remembers the page) and close it at any time. The primary caregiver writes the message. Circle members have no access.

## Public interface

Routes under `/api/good-news` (patient = P, caregiver = C):

- `GET /paper` (P, C): `{editionId, date, now, message: {text, writtenAt} | null, stories: Story[]}`. C can preview.
- `GET /message` (C), `PUT /message {text: 1..500}` (C, replaces), `DELETE /message` (C).
- `index.ts` exports `createGoodNewsService`, `MemoryMessageStore`, `getService` (job runner).
- UI: `ui/index.tsx` registers `morning-paper` (patient, order 1) and `paper-message` (caregiver).

## Where the stories come from

`GOOD_NEWS_LIVE_FEEDS=on` reads a fixed allowlist of good-news RSS feeds (`constants.ts`: Good News Network, Positive
News, Reasons to be Cheerful, The Optimist Daily). "Scraping" means these feeds, never arbitrary sites or client URLs.
Off (default): canned fictional stories in demo, none in live (canned stories must never pass for real news).
Hardening: 8 s timeout, 1.5 MB cap, 25 items per feed, plain text only (HTML/entities/footers/bylines stripped), no links
or images. **Safety filter** (`filter.ts`): drops anything about death, illness, disasters, crime, politics, protest,
emergencies, podcasts... Fewer stories beats one upsetting story. Keeps stories from the last 4 days, de-duplicates, mixes
publishers, max 6 pages.

## Editions and caching

One edition per server-local day, frozen once built (page numbers never shift mid-read), pre-built by the
`good-news-refresh` job every 30 min. A failed fetch retries after 10 min, not on every request. Feeds down: demo falls back
to canned stories; live keeps the last good paper or shows "No news today".

## Data owned

`good_news_messages` (one row per patient, RLS on, no client policies). Stories are not stored. In-memory store only for
now; outside demo mode the store throws instead of silently using memory.

## Demo data

`demoSeed` leaves a fictional good-morning note from the caregiver (40 minutes ago). Canned stories come from
`world.news` plus a few feature-local ones. Open the app as `demo:patient`: the paper opens by itself. As
`demo:caregiver`, change the note. `demo:friend` / `demo:daughter` get 403.

## Patient UI rules baked in

Opens automatically once per edition, then a "Today's paper" card reopens it ("Keep reading" resumes the saved page,
stored per edition in AsyncStorage). Next is the one primary action; Back and Close are always available; Android back
closes it. Big text, plain words ("This morning", never a clock time for the message), no error codes.

## Edge cases

offline / feeds down (canned in demo, last paper or "No news today" in live) · distressing content in "good" feeds
(filter) · malformed or huge feeds · stale caregiver message (24 h) · message replaced while reading (shown on next load) ·
repeated taps (BigButton debounce) · session expiry (calm "not ready yet" line) · storage blocked (just doesn't remember).

## Next steps

Optional AI rewrite of stories into simpler words (via `getProviders().ai`, output untrusted), Supabase store, per-patient
timezone for the edition date, caregiver-chosen topics.

## Test checklist (Definition of Done)

- [x] Happy path
- [x] Edge cases (above)
- [x] Authz: unauthenticated, wrong role, cross-user, circle member (even with grants), unlinked
- [x] Contract: no contracts consumed or implemented
- [x] Cross-feature: none (touches no other feature)
- [x] Flag off => feature inert
- [x] `demoSeed` implemented; works end-to-end in demo mode
