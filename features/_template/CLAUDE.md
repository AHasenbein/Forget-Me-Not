# **FEATURE_NAME**

Read the root `CLAUDE.md` first. Stay inside `features/__FEATURE_NAME__/`.

## Purpose

TODO: one or two sentences. Who uses it (patient / primary caregiver / circle member)?

## Public interface

TODO: routes, exported types, contracts implemented or consumed. Nothing else is public.

## Data owned

TODO: tables (prefix `__FEATURE_TABLE__`), storage buckets. No other feature touches these.

## Demo data

TODO: what `demoSeed` creates (from `DemoWorld`), and what to click/say in the demo. Must work with
`DATA_MODE=demo FEATURE_ALL=on`. No real names, numbers, or documents.

## Events

- Emits: TODO
- Consumes: TODO

## Edge cases (from the root checklist, plus feature-specific)

TODO

## Test checklist (Definition of Done)

- [ ] Happy path
- [ ] Edge cases (above)
- [ ] Authz: unauthenticated, wrong role, cross-user, circle member without grant
- [ ] Contract tests for anything in `contracts/` this feature implements or consumes
- [ ] Cross-feature test (`tests/integration/cross-feature/`) if it touches another feature
- [ ] Flag off => feature inert
- [ ] `demoSeed` implemented; works end-to-end in demo mode (and live adapters are behind `getProviders`)
