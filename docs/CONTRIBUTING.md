# Contributing

## Setup (once)

```bash
git clone <repo> && cd Forget-Me-Not
npm run setup            # npm ci + generated registry + git hooks
cp .env.example .env
brew install gitleaks    # optional locally; CI always scans
```

Demo: `npm run dev:demo` (+ `npm run dev:api:demo`) runs everything on canned fictional data, no keys needed.
Switch to real data with `npm run dev:live`. See "Demo vs live data" in CLAUDE.md.
Mobile: build a **dev client** early (`npx eas build --profile development`). Expo Go can't do background
location, geofencing or reliable push.

## Flow

- One feature per branch: `feat/<feature>/<desc>` (e.g. `feat/friends-family/invite-flow`). Shared changes:
  `chore/core/<desc>` or `chore/contracts/<desc>`, as their own small PR.
- Start a feature with `npm run new-feature <name>`, then fill in `features/<name>/CLAUDE.md`.
- Small PRs (aim < 400 lines). Commit often. Write tests while building.
- `git fetch && git rebase origin/main` before asking for review and before merging. **Squash merge** only.
- A feature branch should touch only `features/<name>/` (plus `.env.example` for new vars). If you need
  `core/` or `contracts/`, open a separate PR first and tell the other dev.
- Merge unfinished work behind the flag (`enabledByDefault: false`).

## CI

- PR (`ci.yml`): lint + format, typecheck, boundary, unit + integration with coverage, build, `npm audit`
  (prod deps; blocks on critical, warns on high), gitleaks. Feature-only PRs run only that feature's tests plus architecture/smoke tests;
  touching anything else runs everything.
- Push to main: `e2e.yml` (also manual) and `deploy.yml` (full CI, then Supabase migrations + EAS Update).

## Deploy secrets (repo → Settings → Secrets and variables → Actions, environment `production`)

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `EXPO_TOKEN`. Run `npx eas init` once
locally to link the Expo project (writes the project id into `app.json`; commit that). Missing secrets skip
that deploy step with a warning instead of failing.

## Branch protection (set manually: Settings → Branches → Add rule for `main`)

- Require a pull request before merging
  - Required approvals: **1**
  - Dismiss stale approvals when new commits are pushed
  - **Require review from Code Owners**
- Require status checks to pass before merging; **require branches to be up to date**. Required checks:
  `scope`, `lint`, `typecheck`, `boundary`, `test`, `build`, `audit`, `secrets`
- Require conversation resolution before merging
- Require linear history
- Do not allow bypassing the above settings; block force pushes and deletions
- Settings → General → Pull Requests: allow **squash merging** only; enable "Automatically delete head branches"

## Post-hackathon

Preview deployments (EAS Update per-PR channels), SAST (CodeQL / Semgrep), Maestro mobile e2e on a dev build,
Dependabot, per-feature coverage thresholds, Supabase branch databases for PRs.
