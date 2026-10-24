import { serve } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { discoverManifests } from '../../core/feature-registry/discover';
import { createApp } from '../../core/server/app';

let server: ReturnType<typeof serve>;
let base = '';
beforeAll(async () => {
  const app = createApp({
    manifests: await discoverManifests(),
    verifier: { verify: async () => null },
  });
  server = serve({ fetch: app.fetch, port: 0 });
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

it('serves /health over real HTTP', async () => {
  const res = await fetch(`${base}/health`);
  expect(res.status).toBe(200);
});
// Mobile UI e2e (Maestro on a dev build) is post-hackathon; see CLAUDE.md "Known limits".
