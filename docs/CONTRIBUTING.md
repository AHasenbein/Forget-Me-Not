# Contributing

## Windows and macOS

Both are supported; CI runs the tests on Windows too. Use **Git Bash or PowerShell** (not cmd.exe) on Windows.

- **Node 24** (npm 11, needed for the lockfile): macOS `brew install fnm`; Windows `winget install Schniz.fnm`
  (or nvm-windows: `nvm install 24 && nvm use 24`; nvm-windows ignores `.nvmrc`). Then `fnm use` in the repo.
- Windows git settings (once): `git config --global core.longpaths true`. Line endings are forced to LF by
  `.gitattributes`; do not set `core.autocrlf=true` overrides in the repo and keep your editor on LF.
- Use `npm run <script>` for everything (they use cross-env, so no `VAR=x cmd` syntax). Don't paste bash-only
  one-liners (`rm -rf`, `cp`) into docs or scripts: write a small Node script in `scripts/` instead.
- **iOS needs a Mac**: Windows has no iOS simulator and can't build iOS locally. The Windows dev tests on an
  Android emulator/device or the web preview; iOS builds come from EAS in the cloud (needs an Apple developer
  account) or the Mac dev. Background location/geofencing/push must be verified on a real device per platform.

## Setup (once)

```bash
git clone <repo> && cd Forget-Me-Not
npm run setup            # npm ci + generated registry + git hooks
                         # setup also creates .env from .env.example if missing
brew install gitleaks    # optional locally (Windows: winget install gitleaks.gitleaks); CI always scans
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
  (prod deps; blocks on critical, warns on high), plus a `windows` job (lint, format, typecheck, tests, e2e, generator), gitleaks. Feature-only PRs run only that feature's tests plus architecture/smoke tests;
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
  `scope`, `lint`, `typecheck`, `boundary`, `test`, `windows`, `build`, `audit`, `secrets`
- Require conversation resolution before merging
- Require linear history
- Do not allow bypassing the above settings; block force pushes and deletions
- Settings → General → Pull Requests: allow **squash merging** only; enable "Automatically delete head branches"

## Post-hackathon

Preview deployments (EAS Update per-PR channels), SAST (CodeQL / Semgrep), Maestro mobile e2e on a dev build,
Dependabot, per-feature coverage thresholds, Supabase branch databases for PRs.
