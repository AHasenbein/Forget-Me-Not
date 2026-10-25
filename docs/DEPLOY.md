# Deploying the public demo (Render)

`render.yaml` defines two free services: `fmn-api` (the Node API in demo mode) and `fmn-web` (the static web export).
Both redeploy automatically when CI passes on `main` (`autoDeployTrigger: checksPass`).

## One-time setup (needs a human with a Render account)

1. Render dashboard > New > Blueprint > connect this GitHub repo > Apply.
2. If `fmn-api` is already taken, rename it in `render.yaml` and set `EXPO_PUBLIC_API_URL` to the API's real `https://...onrender.com` URL.
3. Open the `fmn-web` URL. Use "View as patient / caregiver" to switch roles.

## What this is, and is not

- **Demo only**: fictional data, demo tokens (`demo:patient`, ...) that anyone can use. Never put real patient data on it.
- The API keeps state in memory: it resets when the free instance sleeps (~15 min idle) or redeploys, and the first request after
  sleep takes ~1 minute. Open the API URL `/health` shortly before presenting to wake it.
- **Location privacy**: if a visitor allows location in the patient view, their real position is sent to this public API and can be
  read with the demo caregiver token. Do not let strangers use the patient view on the public demo.
- The live deploy (real login + Supabase) is separate and not wired yet; `deploy.yml` still ships migrations + EAS Update.
