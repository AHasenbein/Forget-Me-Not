import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isDemo } from '../core/config/data-mode';
import { buildDemoWorld, createDemoControls, seedDemo } from '../core/demo';
import { loadEnv } from '../core/config/env';
import { discoverManifests, isEnabled } from '../core/feature-registry/discover';
import { startJobs } from '../core/jobs/runner';
import { getProviders } from '../core/providers';
import { createApp } from '../core/server/app';

const manifests = await discoverManifests();
loadEnv(manifests.filter((m) => isEnabled(m))); // fails fast on bad env
const world = buildDemoWorld();
// live mode: Stage 2 registers the Supabase verifier etc. via registerLive(); until then getProviders throws.
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
