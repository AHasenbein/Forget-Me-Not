import { describe, expect, it } from 'vitest';
import { createApp } from '@core/server/app';
import { bearer, createUnlinkedUser, fakeVerifier } from '@core/testing';
import manifest from '../../manifest';

describe('__FEATURE_NAME__', () => {
  describe('happy path', () => {
    it.todo('does the main thing for the intended role');
  });

  describe('edge cases', () => {
    it.todo('offline / stale data / repeated taps / session expiry (see root checklist)');
  });

  describe('authz', () => {
    it('every route declares access', () => {
      for (const r of manifest.routes) expect(r.access).toBeDefined();
    });
    it('rejects unauthenticated and unlinked callers on every route', async () => {
      const stranger = createUnlinkedUser();
      const app = createApp({
        manifests: [manifest],
        verifier: fakeVerifier([stranger]),
        env: { FEATURE___FEATURE_ENV__: 'on' },
      });
      for (const r of manifest.routes) {
        if ('public' in r.access) continue;
        const path = `/api/${manifest.name}${r.path.replace(/:\w+/g, 'x')}`;
        expect((await app.request(path, { method: r.method })).status).toBe(401);
        const res = await app.request(path, { method: r.method, headers: bearer(stranger) });
        expect([403, 404, 400]).toContain(res.status); // never 200 for an unlinked user
      }
    });
    it.todo('cross-user and cross-role access attempts are denied');
  });

  describe('contract', () => {
    it('manifest name matches folder and ships flagged off', () => {
      expect(manifest.name).toBe('__FEATURE_NAME__');
      expect(manifest.enabledByDefault).toBe(false);
    });
    it.todo('implements/consumes the contracts it claims');
  });

  describe('demo mode', () => {
    it.todo('demoSeed produces the canned data the demo script relies on');
  });

  describe('flag off', () => {
    it('mounts no routes', async () => {
      const app = createApp({ manifests: [manifest], verifier: fakeVerifier([]), env: {} });
      for (const r of manifest.routes) {
        const path = `/api/${manifest.name}${r.path.replace(/:\w+/g, 'x')}`;
        expect((await app.request(path, { method: r.method })).status).toBe(404);
      }
    });
  });
});
