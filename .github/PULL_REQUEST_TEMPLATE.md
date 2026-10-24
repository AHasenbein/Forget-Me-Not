## What & why

<!-- one or two lines -->

## Checklist

- **Feature folder:** `features/<name>/` <!-- or "none" -->
- [ ] `core/` or `contracts/` changed (if yes: say what and why; the other dev must review)
- [ ] `tests/architecture/public-routes.allowlist.ts` changed (if yes: justify)
- [ ] Tests added: happy path / edge cases / **authz (unauthenticated, wrong role, cross-user, circle member without grant)** / contract / cross-feature
- [ ] Edge cases covered (list the ones from CLAUDE.md that apply):
- [ ] Feature flag default is `off` until demo-ready
- [ ] No PII, tokens, location or document contents in logs
- [ ] New env vars added to `.env.example` and the manifest `env` schema
- [ ] `npm run lint && npm run typecheck && npm test` pass locally
