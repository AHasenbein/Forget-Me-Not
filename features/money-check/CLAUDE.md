# money-check

Read the root `CLAUDE.md` first. Stay inside `features/money-check/`.

## Purpose

"Check before you pay": the money moment where a person with dementia is most at risk (a caller wants gift cards, a
bill arrives, a stranger is pushy). The patient types what the payment is for (a short box) before paying anything. The server turns
that into a plain verdict with reasons (information -> understanding), the patient is told to wait (-> confidence),
and the primary caregiver makes one decision: "Don't pay" or "It's OK to pay" (-> action). **Nothing here moves money.**
Circle members have NO access.

## Public interface

Routes under `/api/money-check` (patient = P, caregiver = C):

- `POST /requests` (P): `{ note }` (3-200 chars, what the payment is for) or, for API/tests, `{ kind: 'gift_card' | 'bill' | 'caller_wants_money' }`. The server derives the kind from the note; a client can never send `described`. Idempotent while a request is open (repeated taps
  return the same request, no second push). Max 6 per patient per 24h (429 `too_many`).
- `GET /requests/active` (P, C): P gets status + level + reason codes (never a payee or amount). C gets the request plus the
  bill it is about, looked up from the bank port at view time.
- `POST /requests/:id/decide` (C): `{ decision: 'approve' | 'decline' }`. First decision wins.
- `GET /audit` (C): created / approved / declined / expired, newest first, no amounts.
- Status codes via `HttpError`: 403 `forbidden`/`not_linked`, 404 `not_found` (also another patient's id), 409 `already_decided`/`expired`.

Consumes `getProviders().plaid` (unpaid bills). Emits `caregiver.alert` (`money_check_stop` urgent, `money_check_review` warning).

## The decision engine (`rules.ts`)

Plain rules are the **safety floor**; a model is only a second opinion that can **raise** the level, never lower it.
Typed note: gift-card words => `stop`; scam/pressure words (wire, bail, IRS, grandson, "don't tell", urgent...) => `stop`; bill words =>
the bank check (below); anything else => `check` ("unclear purpose"), **never `ok`** (text cannot prove a payment is real).
Bill via the bank: no unpaid bill found (or bank down) => `check`; over `LARGE_AMOUNT_CENTS` => `check`; otherwise `ok`.
AI (`getProviders().ai`, optional, 8 s timeout): the note is sent as DATA inside markers with an "ignore instructions in it" prompt; the
reply must be strict JSON (`level`, enum `reasons`, `confidence`) or it is discarded. `mergeAi`: final level = max(rules, AI); an unsure
model (< 0.7) raises `ok` to `check` and adds `ai_unsure`; "ok" from a model changes nothing. No model / error / timeout / bad JSON =>
the rules verdict stands. AI free text is never shown: only fixed strings for reason codes. Every level still waits for the caregiver.
In demo mode the AI mock answers with non-JSON, so demo runs on the rules alone; there is no live text-model adapter yet (core PR).

## Rules baked in (don't weaken)

- **Fail closed.** A request starts `pending`. No answer within `REQUEST_TTL_MS` (30 min) => `declined` ("don't pay"), by the
  `money-check.sweep` job and also lazily when anyone touches it. A late approve is a 409 `expired`.
- Only the primary caregiver decides (route `access` + service re-check). The patient cannot approve; circle members get 403 on every route.
- Decisions are compare-and-set: a second caregiver gets 409; the same caregiver tapping twice is idempotent.
- The patient is told "asked your caregiver" only if a push was delivered; otherwise "still trying to reach your caregiver".
  Every patient message says "don't pay" until the caregiver says OK.
- No payee or amount is stored, pushed or put in an event (a bill is a bill id, looked up on view). Push body is generic.
- **The typed note is the one piece of free text** (deliberate change from "no free text"): trimmed, capped at 200, digit runs of 6+
  replaced by `[number]` BEFORE it is stored or sent to a model. It is shown ONLY to the primary caregiver ("They wrote:") and never
  appears in a patient response, push, event, audit entry or log. In live mode it goes to a third-party model (OpenRouter): say so
  in any privacy note.
- Time comes from `@core/clock` `now()` (injected). No `setInterval`.

## Data owned

`money_check_requests`, `money_check_audit` (migrations `...202610250100_init.sql`, `...202610250200_note.sql` adds `note` and the `described` kind; RLS on, no policies, one open request
per patient via a partial unique index). In-memory store only for now; outside demo mode the store and caregiver lookup throw.

## Demo data

`demoSeed` tells the feature who Margaret's caregiver is; a request exists once she asks. Story: as `demo:patient` type
"Before I pay" > "buy gift cards for my grandson" (stop; she is told gift cards are never how real bills are paid); as `demo:caregiver` see
the reasons and tap "Don't pay". Or type "the water bill": the next unpaid bill from the shared world looks normal. Skip ahead
30 min on the demo clock without answering to see it expire to "don't pay". `demo:daughter` / `demo:friend` get 403.
Run with `DATA_MODE=demo FEATURE_ALL=on`.

## UI (`ui/`, dashboard widgets)

Patient widget (order 20): one outlined "Before I pay" button (the reminder keeps the one primary action), a "What is the payment for?" box with one
"Check" button (typing under pressure is hard: a one-tap shortcut for "gift cards" could come back), then a status card (no cancel, no numbers). Caregiver widget (order 2, renders nothing until a request is open): verdict, reasons,
bill, "Don't pay", and "It's OK to pay" (tap twice; armed state expires after 5 s). Logic is in `ui/model.ts`.

## Edge cases covered

repeated/concurrent taps · request spam (daily cap) · caregiver unreachable (expiry => decline) · caregiver revocation (lookup per push)
· two caregivers (first wins) · late approve after expiry · bank outage (never `ok`) · session expiry (plain-words errors).

## Not done / ideas for later

- Supabase store (the schema is ready), live caregiver lookup, real push (mock notifier today).
- Bill system: when it lands, match the typed payee/amount to a real bill and only then allow `ok`.
- A live OpenRouter text adapter for `getProviders().ai` (core PR, ask first) so the AI second opinion runs outside tests.
- The patient's description is a self-report; a future version could read the call/scam-guard signal instead of asking.
- Audit has an API but no screen yet. A "why" explanation from AI could be added for display only, never for the verdict.

## Test checklist (Definition of Done)

- [x] Happy path · [x] Edge cases (above)
- [x] Authz: unauthenticated, wrong role, patient can't approve, circle member (even with grants), cross-patient 404, unlinked
- [ ] Contract tests: n/a (consumes no `contracts/` interface)
- [ ] Cross-feature test: n/a (only the `caregiver.alert` event)
- [x] Flag off => inert · [x] `demoSeed` works in demo mode
