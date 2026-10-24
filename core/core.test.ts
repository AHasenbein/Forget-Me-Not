import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadEnv } from './config/env';
import { EventBus } from './events/bus';
import { isEnabled } from './feature-registry/flags';
import { defineFeature } from './feature-registry/manifest';
import { redact } from './logging/logger';
import { isForbiddenForCircle, hasCirclePermission } from './auth/permissions';
import { createApp } from './server/app';
import {
  FakeClock,
  localParts,
  bearer,
  createCircleMember,
  createLinkedPair,
  createUnlinkedUser,
  fakeVerifier,
  createMockLocation,
  simulatePath,
  geofenceCrossings,
} from './testing';

const demo = defineFeature({
  name: 'demo-x',
  enabledByDefault: false,
  routes: [
    { method: 'GET', path: '/p', access: { roles: ['patient'] }, handler: () => ({ secret: 1 }) },
    {
      method: 'GET',
      path: '/loc',
      access: { roles: ['circle_member'], circlePermission: 'view_location' },
      handler: () => ({}),
    },
    {
      method: 'POST',
      path: '/w',
      access: { roles: ['patient'] },
      input: z.object({ n: z.number() }),
      handler: ({ body }) => body,
    },
    {
      method: 'GET',
      path: '/boom',
      access: { roles: ['patient'] },
      handler: () => {
        throw new Error('db password=hunter2');
      },
    },
  ],
  nav: [],
  permissions: [],
  events: { emits: [], consumes: [] },
  migrations: [],
  env: { DEMO_X_KEY: z.string().min(1) },
});

describe('feature flags + server', () => {
  const { patient } = createLinkedPair();
  const member = createCircleMember(patient);
  const mk = (env: Record<string, string>) =>
    createApp({ manifests: [demo], verifier: fakeVerifier([patient, member]), env });
  it('flag off => nothing mounted', async () => {
    expect((await mk({}).request('/api/demo-x/p', { headers: bearer(patient) })).status).toBe(404);
  });
  it('flag on => 401 without token, 403 wrong role, 200 right role', async () => {
    const app = mk({ FEATURE_DEMO_X: 'on' });
    expect((await app.request('/api/demo-x/p')).status).toBe(401);
    expect((await app.request('/api/demo-x/p', { headers: bearer(member) })).status).toBe(403);
    expect((await app.request('/api/demo-x/p', { headers: bearer(patient) })).status).toBe(200);
  });
  it('enforces circle grants server-side (deny by default)', async () => {
    const granted = createCircleMember(patient, { locationGrant: true });
    const app = createApp({
      manifests: [demo],
      verifier: fakeVerifier([member, granted]),
      env: { FEATURE_DEMO_X: 'on' },
    });
    expect((await app.request('/api/demo-x/loc', { headers: bearer(member) })).status).toBe(403);
    expect((await app.request('/api/demo-x/loc', { headers: bearer(granted) })).status).toBe(200);
  });
  it('validates input and hides internal errors', async () => {
    const app = mk({ FEATURE_DEMO_X: 'on' });
    const h = { ...bearer(patient), 'content-type': 'application/json' };
    expect(
      (await app.request('/api/demo-x/w', { method: 'POST', headers: h, body: '{"n":"x"}' }))
        .status,
    ).toBe(400);
    const res = await app.request('/api/demo-x/boom', { headers: bearer(patient) });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('hunter2');
  });
  it('isEnabled honours overrides', () => {
    expect(isEnabled(demo, { FEATURE_DEMO_X: 'on' })).toBe(true);
    expect(isEnabled(demo, {})).toBe(false);
  });
});

describe('env', () => {
  it('validates only provided manifests and enforces prefixes', () => {
    expect(() => loadEnv([demo], {})).toThrow(/DEMO_X_KEY/);
    expect(loadEnv([demo], { DEMO_X_KEY: 'k' }).features['demo-x']).toEqual({ DEMO_X_KEY: 'k' });
    expect(() => loadEnv([{ ...demo, env: { BAD: z.string() } }], { BAD: 'x' })).toThrow(
      /must start with/,
    );
  });
});

describe('bus, logging, auth, testing helpers', () => {
  it('a failing handler does not block others', async () => {
    const bus = new EventBus();
    const ok = vi.fn();
    bus.on('caregiver.alert', () => {
      throw new Error('x');
    });
    bus.on('caregiver.alert', ok);
    await bus.emit('caregiver.alert', {
      patientId: 'p',
      source: 't',
      severity: 'info',
      reasonCode: 'r',
    });
    expect(ok).toHaveBeenCalled();
  });
  it('redacts location/PII keys', () => {
    expect(redact({ lat: 1, lng: 2, feature: 'a', nested: { email: 'e' } })).toEqual({
      lat: '[redacted]',
      lng: '[redacted]',
      feature: 'a',
      nested: { email: '[redacted]' },
    });
  });
  it('circle members are deny-by-default and never approve/change settings', () => {
    const { patient } = createLinkedPair();
    expect(hasCirclePermission(createCircleMember(patient), 'view_location')).toBe(false);
    expect(
      hasCirclePermission(createCircleMember(patient, { locationGrant: true }), 'view_location'),
    ).toBe(true);
    expect(
      isForbiddenForCircle(
        createCircleMember(patient, { locationGrant: true }),
        'approve_purchase',
      ),
    ).toBe(true);
    expect(createUnlinkedUser().patientId).toBeNull();
  });
  it('localParts sees the DST jump (US spring-forward 2026-03-08)', () => {
    const c = new FakeClock('2026-03-08T06:59:00Z'); // 01:59 EST
    expect(localParts(c.now(), 'America/New_York').hour).toBe(1);
    c.advance(60_000); // one real minute later it is 03:00 EDT
    expect(localParts(c.now(), 'America/New_York')).toMatchObject({ hour: 3, minute: 0 });
  });
  it('FakeClock fires timers in order', () => {
    const c = new FakeClock();
    const order: number[] = [];
    c.schedule(() => order.push(2), 2000);
    c.schedule(() => order.push(1), 1000);
    c.advance(1500);
    expect(order).toEqual([1]);
    c.advance(1000);
    expect(order).toEqual([1, 2]);
  });
  it('mock location fails closed and simulates geofence crossings', async () => {
    const m = createMockLocation({ reading: null });
    expect(
      await m.contract.getLastKnown({ patientId: 'p', requesterId: 'x', purpose: 'circle_view' }),
    ).toBeNull();
    const zone = { id: 'home', patientId: 'p', center: { lat: 0, lng: 0 }, radiusM: 100 };
    const path = simulatePath({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }, 10);
    expect(geofenceCrossings(path, zone).map((e) => e.kind)).toEqual(['exit']);
  });
});
