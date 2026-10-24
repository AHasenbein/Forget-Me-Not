import { describe, expect, it } from 'vitest';
import { ROLES } from '@contracts/circle';
import { discoverManifests } from '@core/feature-registry/discover';
import type { FeatureManifest } from '@core/feature-registry/manifest';
import { createApp } from '@core/server/app';
import { fakeVerifier } from '@core/testing';
import type { AuthUser } from '@core/auth/types';
import { envKey } from '@core/config/env';
import { PUBLIC_ROUTE_ALLOWLIST } from './public-routes.allowlist';

/**
 * Static audit: every route declares access; public ones are allow-listed; routes open to circle
 * members declare which grant they need (or null); writes validate input.
 */
export function auditRoutes(
  manifests: readonly FeatureManifest[],
  allow: readonly string[],
): string[] {
  const problems: string[] = [];
  for (const m of manifests) {
    for (const r of m.routes) {
      const id = `${m.name} ${r.method} ${r.path}`;
      const a = r.access as unknown;
      if (!a || typeof a !== 'object') {
        problems.push(`${id}: missing access`);
        continue;
      }
      if ('public' in a) {
        if (!allow.includes(id)) problems.push(`${id}: public but not in allowlist`);
        continue;
      }
      const { roles, circlePermission } = a as { roles?: unknown; circlePermission?: unknown };
      if (!Array.isArray(roles) || roles.length === 0) {
        problems.push(`${id}: needs roles`);
        continue;
      }
      if (roles.includes('circle_member') && circlePermission === undefined)
        problems.push(`${id}: circle_member route must declare circlePermission (or null)`);
      if (['POST', 'PUT', 'PATCH'].includes(r.method) && !r.input)
        problems.push(`${id}: write route without input schema`);
    }
  }
  return problems;
}

// Users have NO circle grants, so any route requiring one must 403 for circle members.
const user = (role: AuthUser['role']): AuthUser => ({
  id: `u_${role}`,
  role,
  patientId: 'p1',
  grants: [],
});
const as = (role: string) => ({ authorization: `Bearer test:u_${role}` });

describe('route auth', () => {
  it('every registered route requires auth + a role check unless allow-listed', async () => {
    const manifests = await discoverManifests(); // vacuously passes with zero features
    expect(auditRoutes(manifests, PUBLIC_ROUTE_ALLOWLIST)).toEqual([]);

    const env = Object.fromEntries(manifests.map((m) => [`FEATURE_${envKey(m.name)}`, 'on']));
    const app = createApp({ manifests, verifier: fakeVerifier(ROLES.map(user)), env });
    for (const m of manifests) {
      for (const r of m.routes) {
        if ('public' in r.access) continue;
        const { roles, circlePermission } = r.access;
        const path = `/api/${m.name}${r.path.replace(/:\w+/g, 'x')}`;
        const status = async (headers?: Record<string, string>) =>
          (await app.request(path, { method: r.method, headers })).status;

        expect(await status(), `${path} unauthenticated`).toBe(401);
        const denied = ROLES.find((role) => !roles.includes(role));
        if (denied) expect(await status(as(denied)), `${path} as ${denied}`).toBe(403);
        if (circlePermission && roles.includes('circle_member'))
          expect(
            await status(as('circle_member')),
            `${path} as circle_member without ${circlePermission}`,
          ).toBe(403);
      }
    }
  });

  describe('auditor self-test (proves the rule is not vacuous)', () => {
    const base = {
      name: 'x',
      enabledByDefault: true,
      nav: [],
      permissions: [],
      events: { emits: [], consumes: [] },
      migrations: [],
    };
    const route = (extra: object) =>
      ({ method: 'GET', path: '/a', handler: () => ({}), ...extra }) as never;
    const audit = (extra: object) => auditRoutes([{ ...base, routes: [route(extra)] }], []);

    it('flags missing access, unlisted public routes, and unvalidated writes', () => {
      expect(audit({})).toHaveLength(1);
      expect(audit({ access: { public: true } })).toHaveLength(1);
      expect(audit({ method: 'POST', access: { roles: ['patient'] } })).toHaveLength(1);
    });
    it('flags circle_member routes that do not declare circlePermission', () => {
      expect(audit({ access: { roles: ['circle_member'] } })).toHaveLength(1);
      expect(audit({ access: { roles: ['circle_member'], circlePermission: null } })).toEqual([]);
    });
    it('accepts a well-formed route', () => {
      expect(audit({ access: { roles: ['patient'] } })).toEqual([]);
    });
  });
});
