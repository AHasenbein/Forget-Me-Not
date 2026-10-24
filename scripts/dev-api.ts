import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createVerifier, supabaseAuthPorts } from '../core/auth/supabase-verifier';
import { isDemo } from '../core/config/data-mode';
import { serviceClient } from '../core/db';
import { buildDemoWorld, createDemoControls, seedDemo } from '../core/demo';
import { loadEnv } from '../core/config/env';
import { discoverManifests, isEnabled } from '../core/feature-registry/discover';
import { startJobs } from '../core/jobs/runner';
import { getProviders, registerLive } from '../core/providers';
import { createApp } from '../core/server/app';

const manifests = await discoverManifests();
loadEnv(manifests.filter((m) => isEnabled(m))); // fails fast on bad env
const world = buildDemoWorld();
// Live: real tokens are checked with Supabase Auth, then role/patient come from our `profiles` table.
// AI/Plaid/notifier/location stay on their demo adapters until their live ones exist (DATA_MODE_<SERVICE>=demo).
if (!isDemo()) registerLive('verifier', createVerifier(supabaseAuthPorts(serviceClient())));
const { verifier } = getProviders({ world });

const root = new Hono();
const demo = isDemo();
if (demo) {
  // Demo only: lets the web preview / phones on the LAN call the API, and mounts the time controls.
  root.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'] }));
  root.route('/demo', createDemoControls({ manifests, verifier }));
  console.log(
    'DEMO MODE: canned data, tokens demo:patient | demo:caregiver | demo:daughter | demo:friend',
  );
  console.log('seeded:', await seedDemo(manifests, { world }));
}
if (!demo) {
  // Live: only the web app's origin(s) may call the API from a browser. Native apps are not subject to CORS.
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:8081')
    .split(',')
    .map((o) => o.trim());
  root.use('*', cors({ origin: origins, allowHeaders: ['Authorization', 'Content-Type'] }));
}
root.route('/', createApp({ manifests, verifier }));

const stopJobs = startJobs(manifests);
const port = Number(process.env.PORT ?? 8787);
// 0.0.0.0 in demo so a phone on the same Wi-Fi can reach it; localhost-only otherwise.
const server = serve({ fetch: root.fetch, port, hostname: demo ? '0.0.0.0' : '127.0.0.1' });
console.log(`API on :${port}`);
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    stopJobs();
    server.close();
    process.exit(0);
  });
