import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoWorld, seedDemo } from '@core/demo';
import { createApp } from '@core/server/app';
import {
  FakeClock,
  bearer,
  createCircleMember,
  createLinkedPair,
  createMockLocation,
  createMockNotifier,
  createPrimaryCaregiver,
  createPatient,
  createUnlinkedUser,
  fakeVerifier,
} from '@core/testing';
import manifest from '../../manifest';
import { resetRuntime } from '../../runtime';
import { setCaregivers } from '../../runtime';

const clock = new FakeClock('2026-01-01T12:00:00Z');
const { patient, caregiver } = createLinkedPair();
const daughter = createCircleMember(patient, { locationGrant: true });
const otherCaregiver = createPrimaryCaregiver(createPatient());
const unlinked = createUnlinkedUser('patient');
const users = [patient, caregiver, daughter, otherCaregiver, unlinked];
const reading = {
  lat: 40.7,
  lng: -74,
  accuracyM: 10,
  recordedAt: clock.now().toISOString(),
  source: 'gps' as const,
  stale: false,
};

let push: ReturnType<typeof createMockNotifier>;
const app = () =>
  createApp({
    manifests: [manifest],
    verifier: fakeVerifier(users),
    env: { FEATURE_LOST_BUTTON: 'on' },
  });
const call = (method: 'GET' | 'POST', path: string, who?: (typeof users)[number], body?: unknown) =>
  app().request(`/api/lost-button${path}`, {
    method,
    headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

beforeEach(() => {
  clock.setTime('2026-01-01T12:00:00Z');
  push = createMockNotifier();
  resetRuntime({
    notifier: push,
    location: createMockLocation({ reading, allow: (id) => id === caregiver.id }).contract,
    now: clock.now,
  });
  setCaregivers(patient.id, [caregiver.id]);
});

describe('lost-button routes', () => {
  it('happy path: press, caregiver sees it with the location, acknowledges, patient sees help is coming, resolve', async () => {
    const press = await call('POST', '/alerts', patient);
    expect(press.status).toBe(200);
    const { alert } = await press.json();
    expect(alert.status).toBe('notified');
    expect(push.sent).toHaveLength(1);

    const seen = await (await call('GET', '/alerts/active', caregiver)).json();
    expect(seen.alert.id).toBe(alert.id);
    expect(seen.location).toMatchObject({ lat: 40.7 });

    expect((await call('POST', `/alerts/${alert.id}/acknowledge`, caregiver)).status).toBe(200);
    expect((await (await call('GET', '/alerts/active', patient)).json()).alert.status).toBe(
      'on_the_way',
    );
    expect((await call('POST', `/alerts/${alert.id}/resolve`, caregiver)).status).toBe(200);
    expect((await (await call('GET', '/alerts/active', caregiver)).json()).alert).toBeNull();
  });

  it('rejects unauthenticated callers on every route', async () => {
    expect((await call('POST', '/alerts')).status).toBe(401);
    expect((await call('GET', '/alerts/active')).status).toBe(401);
    expect((await call('POST', '/alerts/x/acknowledge')).status).toBe(401);
    expect((await call('POST', '/alerts/x/resolve')).status).toBe(401);
  });

  it('circle members are refused everywhere, even with a location grant', async () => {
    const { alert } = await (await call('POST', '/alerts', patient)).json();
    expect((await call('POST', '/alerts', daughter)).status).toBe(403);
    expect((await call('GET', '/alerts/active', daughter)).status).toBe(403);
    expect((await call('POST', `/alerts/${alert.id}/acknowledge`, daughter)).status).toBe(403);
    expect((await call('POST', `/alerts/${alert.id}/resolve`, daughter)).status).toBe(403);
  });

  it('wrong role: the patient cannot acknowledge/resolve, the caregiver cannot press', async () => {
    const { alert } = await (await call('POST', '/alerts', patient)).json();
    expect((await call('POST', `/alerts/${alert.id}/acknowledge`, patient)).status).toBe(403);
    expect((await call('POST', `/alerts/${alert.id}/resolve`, patient)).status).toBe(403);
    expect((await call('POST', '/alerts', caregiver)).status).toBe(403);
  });

  it("cross-user: another patient's caregiver gets 404 and never sees this alert", async () => {
    const { alert } = await (await call('POST', '/alerts', patient)).json();
    expect((await call('POST', `/alerts/${alert.id}/acknowledge`, otherCaregiver)).status).toBe(
      404,
    );
    expect(await (await call('GET', '/alerts/active', otherCaregiver)).json()).toEqual({
      alert: null,
      location: null,
    });
  });

  it('an unlinked patient is refused', async () => {
    expect((await call('POST', '/alerts', unlinked)).status).toBe(403);
  });

  it('ignores a patientId or coordinates in the body', async () => {
    expect((await call('POST', '/alerts', patient, { patientId: 'someone-else' })).status).toBe(
      400,
    );
    expect((await call('POST', '/alerts', patient, { lat: 1, lng: 2 })).status).toBe(400);
  });

  it('a double tap makes one alert and one push', async () => {
    await Promise.all([call('POST', '/alerts', patient), call('POST', '/alerts', patient)]);
    expect(push.sent).toHaveLength(1);
  });
});

describe('demo mode and flag', () => {
  it('demoSeed lets the demo patient reach the demo caregiver; the friend cannot see it', async () => {
    resetRuntime({ now: clock.now }); // real demo providers, as in `dev:api:demo`
    const world = buildDemoWorld(clock.now());
    const env = { DATA_MODE: 'demo', FEATURE_ALL: 'on' };
    expect(await seedDemo([manifest], { world, env })).toEqual(['lost-button']);
    await seedDemo([manifest], { world, env }); // idempotent
    const demoApp = createApp({
      manifests: [manifest],
      verifier: fakeVerifier([world.patient, world.caregiver, world.friend]),
      env,
    });
    const go = (m: 'GET' | 'POST', p: string, u: typeof world.patient) =>
      demoApp.request(`/api/lost-button${p}`, {
        method: m,
        headers: { ...bearer(u), 'content-type': 'application/json' },
        body: m === 'POST' ? '{}' : undefined,
      });
    expect((await go('POST', '/alerts', world.patient)).status).toBe(200);
    const seen = await (await go('GET', '/alerts/active', world.caregiver)).json();
    expect(seen.location).toMatchObject({ lat: world.location.lastKnown.lat });
    expect((await go('GET', '/alerts/active', world.friend)).status).toBe(403);
  });

  it('flag off => no routes', async () => {
    const off = createApp({ manifests: [manifest], verifier: fakeVerifier([]), env: {} });
    for (const r of manifest.routes)
      expect(
        (await off.request(`/api/lost-button${r.path.replace(':id', 'x')}`, { method: r.method }))
          .status,
      ).toBe(404);
  });

  it('manifest name matches folder and ships flagged off', () => {
    expect(manifest.name).toBe('lost-button');
    expect(manifest.enabledByDefault).toBe(false);
  });
});
