import { serve } from '@hono/node-server';
import { isDemo } from '../core/config/data-mode';
import { buildDemoWorld, seedDemo } from '../core/demo';
import { getProviders } from '../core/providers';
import { loadEnv } from '../core/config/env';
import { discoverManifests, isEnabled } from '../core/feature-registry/discover';
import { createApp } from '../core/server/app';

const manifests = await discoverManifests();
loadEnv(manifests.filter((m) => isEnabled(m))); // fails fast on bad env
const world = buildDemoWorld();
if (isDemo()) {
  console.log(
    'DEMO MODE: canned data, tokens demo:patient | demo:caregiver | demo:daughter | demo:friend',
  );
  console.log('seeded:', await seedDemo(manifests, { world }));
}
// live mode: Stage 2 registers the Supabase verifier etc. via registerLive(); until then getProviders throws.
const app = createApp({ manifests, verifier: getProviders({ world }).verifier });
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
console.log(`API on :${process.env.PORT ?? 8787}`);
