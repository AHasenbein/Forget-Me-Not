import { Hono } from 'hono';
import { logger } from '../logging/logger';
import type { TokenVerifier } from '../auth/types';
import { hasCirclePermission, hasRole } from '../auth/permissions';
import { EventBus } from '../events/bus';
import { isEnabled } from '../feature-registry/flags';
import type { FeatureManifest } from '../feature-registry/manifest';

export interface AppDeps {
  manifests: readonly FeatureManifest[];
  verifier: TokenVerifier;
  bus?: EventBus;
  env?: Record<string, string | undefined>;
}

/**
 * Builds the API from manifests. Auth is enforced HERE (deny by default), not in handlers:
 * no token -> 401, wrong role or missing circle grant -> 403, invalid body -> 400. Flagged-off features mount nothing.
 */
export function createApp({
  manifests,
  verifier,
  bus = new EventBus(),
  env = process.env,
}: AppDeps) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));

  for (const m of manifests) {
    if (!isEnabled(m, env)) continue; // inert: no routes, no subscriptions
    m.register?.({ bus });
    for (const r of m.routes) {
      const path = `/api/${m.name}${r.path}`;
      app.on(r.method, path, async (c) => {
        let user = null;
        if (!('public' in r.access)) {
          const header = c.req.header('authorization') ?? '';
          const token = header.startsWith('Bearer ') ? header.slice(7) : '';
          user = token ? await verifier.verify(token) : null;
          if (!user) return c.json({ error: 'unauthenticated' }, 401);
          if (!hasRole(user, r.access.roles)) return c.json({ error: 'forbidden' }, 403);
          const perm = r.access.circlePermission;
          if (user.role === 'circle_member' && perm && !hasCirclePermission(user, perm))
            return c.json({ error: 'forbidden' }, 403);
        }
        let body: unknown = undefined;
        if (r.input) {
          const parsed = r.input.safeParse(await c.req.json().catch(() => undefined));
          if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
          body = parsed.data;
        }
        try {
          const result = await r.handler({
            user,
            body,
            params: c.req.param(),
            query: c.req.query(),
          });
          return c.json(result ?? { ok: true });
        } catch (err) {
          logger.error('route failed', { feature: m.name, route: path, err: String(err) });
          return c.json({ error: 'internal' }, 500); // never leak internals
        }
      });
    }
  }
  return app;
}
