import { Hono } from 'hono';
import type { TokenVerifier } from '../auth/types';
import { getSpeed, jump, MAX_SPEED, now, setSpeed } from '../clock';
import { isDemo } from '../config/data-mode';
import type { FeatureManifest } from '../feature-registry/manifest';
import { resetDemo } from './reset';
import { getVisionOutcome, setVisionOutcome, VISION_OUTCOMES, type VisionOutcome } from './vision';

/**
 * Demo-only dev tools (speed up time, jump, reset). Mounted by the dev API ONLY; every route is 404
 * outside demo mode, and circle members can never use them (they can't change settings).
 */
export function createDemoControls(deps: {
  manifests: readonly FeatureManifest[];
  verifier: TokenVerifier;
  env?: Record<string, string | undefined>;
}) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (!isDemo('data', deps.env as never)) return c.json({ error: 'not_found' }, 404);
    const token = (c.req.header('authorization') ?? '').replace(/^Bearer /, '');
    const user = token ? await deps.verifier.verify(token) : null;
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    if (user.role === 'circle_member') return c.json({ error: 'forbidden' }, 403);
    await next();
  });
  const state = () => ({ now: now().toISOString(), speed: getSpeed(), maxSpeed: MAX_SPEED });
  const body = async (c: { req: { json(): Promise<unknown> } }) =>
    ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

  app.get('/clock', (c) => c.json(state()));
  app.post('/clock/speed', async (c) => {
    try {
      setSpeed(Number((await body(c)).speed));
    } catch {
      return c.json({ error: 'invalid_input' }, 400);
    }
    return c.json(state());
  });
  app.post('/clock/jump', async (c) => {
    try {
      jump(Number((await body(c)).minutes) * 60_000);
    } catch {
      return c.json({ error: 'invalid_input' }, 400);
    }
    return c.json(state());
  });
  app.get('/vision', (c) => c.json({ outcome: getVisionOutcome(), options: VISION_OUTCOMES }));
  app.post('/vision', async (c) => {
    const o = (await body(c)).outcome;
    if (!(VISION_OUTCOMES as readonly unknown[]).includes(o))
      return c.json({ error: 'invalid_input' }, 400);
    setVisionOutcome(o as VisionOutcome);
    return c.json({ outcome: o, options: VISION_OUTCOMES });
  });
  app.post('/reset', async (c) =>
    c.json({ seeded: await resetDemo(deps.manifests, deps.env), ...state() }),
  );
  return app;
}
