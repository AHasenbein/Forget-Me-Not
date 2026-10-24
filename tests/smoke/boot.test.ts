import { describe, expect, it } from 'vitest';
import { discoverManifests } from '@core/feature-registry/discover';
import { loadEnv } from '@core/config/env';
import { createApp } from '@core/server/app';
import { fakeVerifier } from '@core/testing';

describe('app boot', () => {
  it('discovers features, validates env, and serves /health', async () => {
    const manifests = await discoverManifests();
    loadEnv(manifests, {});
    const app = createApp({ manifests, verifier: fakeVerifier([]) });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
