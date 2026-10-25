import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createOpenRouterDocuments } from '../core/ai/openrouter-documents';
import { createOpenRouterText } from '../core/ai/openrouter-text';
import { createOpenRouterVision } from '../core/ai/openrouter-vision';
import { createClient } from '@supabase/supabase-js';
import { createQuickLogin } from '../core/auth/quick-login';
import { createVerifier, supabaseAuthPorts } from '../core/auth/supabase-verifier';
import { dataMode, isDemo } from '../core/config/data-mode';
import { serviceClient } from '../core/db';
import { buildDemoWorld, createDemoControls, seedDemo } from '../core/demo';
import { loadEnv } from '../core/config/env';
import { discoverManifests, isEnabled } from '../core/feature-registry/discover';
import { startJobs } from '../core/jobs/runner';
import { getProviders, registerLive } from '../core/providers';
import { createApp } from '../core/server/app';

// Accept the common misspelling too: OPEN_ROUTER_API_KEY.
const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;

const manifests = await discoverManifests();
loadEnv(manifests.filter((m) => isEnabled(m))); // fails fast on bad env
const world = buildDemoWorld();
// Live: real tokens are checked with Supabase Auth, then role/patient come from our `profiles` table.
// AI/Plaid/notifier/location stay on their demo adapters until their live ones exist (DATA_MODE_<SERVICE>=demo).
if (!isDemo()) registerLive('verifier', createVerifier(supabaseAuthPorts(serviceClient())));
// Real photo checks only when asked for (DATA_MODE_VISION=live) AND a key exists; otherwise the canned check.
if (dataMode('vision') === 'live') {
  const apiKey = openRouterKey;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new Error('DATA_MODE_VISION=live needs OPENROUTER_API_KEY in .env');
  registerLive('vision', createOpenRouterVision({ apiKey, model: model || undefined }));
}
// Bill reader (photo of a bill -> plain description): live only when asked for (DATA_MODE_DOCUMENTS=live).
if (dataMode('documents') === 'live') {
  const apiKey = openRouterKey;
  if (!apiKey) throw new Error('DATA_MODE_DOCUMENTS=live needs OPENROUTER_API_KEY in .env');
  registerLive(
    'documents',
    createOpenRouterDocuments({ apiKey, model: process.env.OPENROUTER_MODEL || undefined }),
  );
}
// Text AI (e.g. the money check's second opinion): live only when asked for (DATA_MODE_AI=live), and then it needs a key.
if (dataMode('ai') === 'live') {
  const apiKey = openRouterKey;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new Error('DATA_MODE_AI=live needs OPENROUTER_API_KEY in .env');
  registerLive('ai', createOpenRouterText({ apiKey, model: model || undefined }));
}
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
// Dev convenience: pick-an-account sign-in. Off unless QUICK_LOGIN=on; never in demo or production.
if (!demo && process.env.QUICK_LOGIN === 'on' && process.env.NODE_ENV !== 'production') {
  const { SEED_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SEED_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON_KEY)
    throw new Error('QUICK_LOGIN=on needs SEED_PASSWORD, SUPABASE_URL and SUPABASE_ANON_KEY');
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  root.route(
    '/dev',
    createQuickLogin({
      enabled: true,
      password: SEED_PASSWORD,
      signIn: async (email, password) => {
        const { data, error } = await anon.auth.signInWithPassword({ email, password });
        return error || !data.session
          ? null
          : { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
      },
    }),
  );
  console.warn('QUICK LOGIN is ON (localhost only). Never enable it on a deployed server.');
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
