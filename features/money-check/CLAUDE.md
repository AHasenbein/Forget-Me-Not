# money-check

Read the root `CLAUDE.md` first. Stay inside `features/money-check/`.

## Purpose

"Check before you pay": the money moment where a person with dementia is most at risk (a caller wants gift cards, a
bill arrives, a stranger is pushy). The patient taps one of three big choices before paying anything. The server turns
that into a plain verdict with reasons (information -> understanding), the patient is told to wait (-> confidence),
and the primary caregiver makes one decision: "Don't pay" or "It's OK to pay" (-> action). **Nothing here moves money.**
Circle members have NO access.

## Public interface

Routes under `/api/money-check` (patient = P, caregiver = C):

- `POST /requests` (P): `{ kind: 'gift_card' | 'bill' | 'caller_wants_money' }`. Idempotent while a request is open (repeated taps
  return the same request, no second push). Max 6 per patient per 24h (429 `too_many`).
- `GET /requests/active` (P, C): P gets status + level + reason codes (never a payee or amount). C gets the request plus the
  bill it is about, looked up from the bank port at view time.
- `POST /requests/:id/decide` (C): `{ decision: 'approve' | 'decline' }`. First decision wins.
- `GET /audit` (C): created / approved / declined / expired, newest first, no amounts.
- Status codes via `HttpError`: 403 `forbidden`/`not_linked`, 404 `not_found` (also another patient's id), 409 `already_decided`/`expired`.

Consumes `getProviders().plaid` (unpaid bills). Emits `caregiver.alert` (`money_check_stop` urgent, `money_check_review` warning).

## The decision engine (`rules.ts`)

Pure rules, **no AI**. The demo AI mock answers every call with the scam-call summary, and model output is untrusted, so a
model never decides here and never needs to. Gift card or caller-wants-money => `stop`. A bill: no unpaid bill found (or the bank
is down) => `check`; over `LARGE_AMOUNT_CENTS` => `check`; otherwise `ok`. Every level still waits for the caregiver.

## Rules baked in (don't weaken)

- **Fail closed.** A request starts `pending`. No answer within `REQUEST_TTL_MS` (30 min) => `declined` ("don't pay"), by the
  `money-check.sweep` job and also lazily when anyone touches it. A late approve is a 409 `expired`.
- Only the primary caregiver decides (route `access` + service re-check). The patient cannot approve; circle members get 403 on every route.
- Decisions are compare-and-set: a second caregiver gets 409; the same caregiver tapping twice is idempotent.
- The patient is told "asked your caregiver" only if a push was delivered; otherwise "still trying to reach your caregiver".
  Every patient message says "don't pay" until the caregiver says OK.
- No payee, amount or free text is stored, pushed or put in an event (a bill is a bill id, looked up on view). Push body is generic.
- Time comes from `@core/clock` `now()` (injected). No `setInterval`.

## Data owned

`money_check_requests`, `money_check_audit` (migration `money-check__202610250100_init.sql`; RLS on, no policies, one open request
per patient via a partial unique index). In-memory store only for now; outside demo mode the store and caregiver lookup throw.

## Demo data

`demoSeed` tells the feature who Margaret's caregiver is; a request exists once she asks. Story: as `demo:patient` tap
"Before I pay" > "Someone wants gift cards" (stop; she is told gift cards are never how real bills are paid); as `demo:caregiver` see
the reasons and tap "Don't pay". Or pick "I have a bill to pay": the next unpaid bill from the shared world looks normal. Skip ahead
30 min on the demo clock without answering to see it expire to "don't pay". `demo:daughter` / `demo:friend` get 403.
Run with `DATA_MODE=demo FEATURE_ALL=on`.

## UI (`ui/`, dashboard widgets)

Patient widget (order 20): one outlined "Before I pay" button (the reminder keeps the one primary action), three big choices, then a
status card (no cancel, no typing, no numbers). Caregiver widget (order 2, renders nothing until a request is open): verdict, reasons,
bill, "Don't pay", and "It's OK to pay" (tap twice; armed state expires after 5 s). Logic is in `ui/model.ts`.

## Edge cases covered

repeated/concurrent taps · request spam (daily cap) · caregiver unreachable (expiry => decline) · caregiver revocation (lookup per push)
· two caregivers (first wins) · late approve after expiry · bank outage (never `ok`) · session expiry (plain-words errors).

## Not done / ideas for later

- Supabase store (the schema is ready), live caregiver lookup, real push (mock notifier today).
- The patient's choice is a self-report; a future version could read the call/scam-guard signal instead of asking.
- Audit has an API but no screen yet. A "why" explanation from AI could be added for display only, never for the verdict.

## Test checklist (Definition of Done)

- [x] Happy path · [x] Edge cases (above)
- [x] Authz: unauthenticated, wrong role, patient can't approve, circle member (even with grants), cross-patient 404, unlinked
- [ ] Contract tests: n/a (consumes no `contracts/` interface)
- [ ] Cross-feature test: n/a (only the `caregiver.alert` event)
- [x] Flag off => inert · [x] `demoSeed` works in demo mode
