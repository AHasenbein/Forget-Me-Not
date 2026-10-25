import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@core/server/app';
import { seedDemo, buildDemoWorld } from '@core/demo';
import {
  FakeClock,
  bearer,
  createCircleMember,
  createLinkedPair,
  createPatient,
  createPrimaryCaregiver,
  createUnlinkedUser,
  fakeVerifier,
} from '@core/testing';
import { REPORT_INTERVAL_MS, STALE_AFTER_MS } from '../../constants';
import manifest from '../../manifest';
import { getRuntime, readerKey, resetRuntime } from '../../server/runtime';

const clock = new FakeClock('2026-01-01T12:00:00Z');
const iso = (msAgo: number) => new Date(clock.now().getTime() - msAgo).toISOString();
const reading = (msAgo = 0, lat = 40.71) => ({
  lat,
  lng: -74.0,
  accuracyM: 10,
  recordedAt: iso(msAgo),
  source: 'gps' as const,
});

const { patient, caregiver } = createLinkedPair();
const daughter = createCircleMember(patient, { locationGrant: true });
const friend = createCircleMember(patient); // no view_location
const otherPatient = createPatient();
const otherCaregiver = createPrimaryCaregiver(otherPatient);
const unlinkedCaregiver = createUnlinkedUser('primary_caregiver');
const users = [
  patient,
  caregiver,
  daughter,
  friend,
  otherPatient,
  otherCaregiver,
  unlinkedCaregiver,
];

const app = () =>
  createApp({
    manifests: [manifest],
    verifier: fakeVerifier(users),
    env: { FEATURE_LOCATION_TRACKING: 'on' },
  });
const call = (path: string, who?: (typeof users)[number], body?: unknown) =>
  app().request(`/api/location-tracking${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  clock.setTime('2026-01-01T12:00:00Z');
  resetRuntime(clock.now);
});

describe('location-tracking', () => {
  describe('happy path', () => {
    it('patient reports, caregiver sees it, and the view is audited', async () => {
      const post = await call('/readings', patient, { readings: [reading(60_000)] });
      expect(post.status).toBe(200);
      expect(await post.json()).toEqual({ accepted: 1, rejected: 0 });

      const res = await call('/location', caregiver);
      const { location } = await res.json();
      expect(location).toMatchObject({ lat: 40.71, lng: -74.0, stale: false });

      const { views } = await (await call('/views', caregiver)).json();
      expect(views).toHaveLength(1);
      expect(views[0]).toMatchObject({
        requesterId: caregiver.id,
        patientId: patient.id,
        purpose: 'caregiver_view',
        outcome: 'served',
        byYou: true,
      });
      expect(JSON.stringify(views)).not.toContain('40.71'); // audit never holds coordinates
    });

    it("the daughter's look is not byYou for the caregiver (it belongs in Worth knowing)", async () => {
      await call('/readings', patient, { readings: [reading()] });
      await call('/location', daughter);
      const { views } = await (await call('/views', caregiver)).json();
      expect(views[0]).toMatchObject({ purpose: 'circle_view', byYou: false });
    });

    it('circle member with the grant can view and is audited as circle_view', async () => {
      await call('/readings', patient, { readings: [reading()] });
      const res = await call('/location', daughter);
      expect(res.status).toBe(200);
      expect((await res.json()).location).not.toBeNull();
      expect(getRuntime().store.listAudit(patient.id, 10)[0]?.purpose).toBe('circle_view');
    });
  });

  describe('edge cases', () => {
    it('keeps the newest reading when an offline queue arrives out of order', async () => {
      const res = await call('/readings', patient, {
        readings: [reading(10 * 60_000, 40.1), reading(60_000, 40.3), reading(5 * 60_000, 40.2)],
      });
      expect((await res.json()).accepted).toBe(3);
      expect((await (await call('/location', caregiver)).json()).location.lat).toBe(40.3);
      // a later, older flush must not overwrite it either
      await call('/readings', patient, { readings: [reading(30 * 60_000, 40.9)] });
      expect((await (await call('/location', caregiver)).json()).location.lat).toBe(40.3);
    });

    it('marks a reading stale only after 3 missed intervals (server clock)', async () => {
      await call('/readings', patient, { readings: [reading()] });
      expect(STALE_AFTER_MS).toBe(3 * REPORT_INTERVAL_MS);
      clock.advance(STALE_AFTER_MS);
      expect((await (await call('/location', caregiver)).json()).location.stale).toBe(false);
      clock.advance(1);
      expect((await (await call('/location', caregiver)).json()).location.stale).toBe(true);
    });

    it('ignores a client-sent stale flag', async () => {
      await call('/readings', patient, {
        readings: [{ ...reading(STALE_AFTER_MS + 1000), stale: false }],
      });
      expect((await (await call('/location', caregiver)).json()).location.stale).toBe(true);
    });

    it('rejects future-dated readings (clock skew / spoofing)', async () => {
      const res = await call('/readings', patient, { readings: [reading(-10 * 60_000)] });
      expect(await res.json()).toEqual({ accepted: 0, rejected: 1 });
      expect((await (await call('/location', caregiver)).json()).location).toBeNull();
    });

    it('rejects invalid coordinates, empty and oversized batches', async () => {
      for (const bad of [
        { ...reading(), lat: 91 },
        { ...reading(), lng: -181 },
        { ...reading(), accuracyM: -1 },
        { ...reading(), recordedAt: 'yesterday' },
        { ...reading(), source: 'telepathy' },
      ])
        expect((await call('/readings', patient, { readings: [bad] })).status).toBe(400);
      expect((await call('/readings', patient, { readings: [] })).status).toBe(400);
      const many = Array.from({ length: 51 }, () => reading());
      expect((await call('/readings', patient, { readings: many })).status).toBe(400);
    });

    it('returns no location (not an error) before any reading exists', async () => {
      expect((await (await call('/location', caregiver)).json()).location).toBeNull();
      expect(getRuntime().store.listAudit(patient.id, 10)[0]?.outcome).toBe('no_data');
    });
  });

  describe('authz', () => {
    it('every route declares access', () => {
      for (const r of manifest.routes) expect(r.access).toBeDefined();
    });
    it('rejects unauthenticated callers on every route', async () => {
      expect((await call('/location')).status).toBe(401);
      expect((await call('/views')).status).toBe(401);
      expect((await call('/readings', undefined, { readings: [reading()] })).status).toBe(401);
    });
    it('wrong role: patient cannot read, caregiver and circle cannot report', async () => {
      expect((await call('/location', patient)).status).toBe(403);
      expect((await call('/views', patient)).status).toBe(403);
      expect((await call('/readings', caregiver, { readings: [reading()] })).status).toBe(403);
      expect((await call('/readings', daughter, { readings: [reading()] })).status).toBe(403);
    });
    it('circle member without the grant is denied, even with other grants', async () => {
      await call('/readings', patient, { readings: [reading()] });
      expect((await call('/location', friend)).status).toBe(403);
    });
    it('circle members cannot read the audit log', async () => {
      expect((await call('/views', daughter)).status).toBe(403);
    });
    it('cross-user: another patient’s caregiver never sees this patient', async () => {
      await call('/readings', patient, { readings: [reading()] });
      const res = await call('/location', otherCaregiver);
      expect((await res.json()).location).toBeNull();
      const { views } = await (await call('/views', otherCaregiver)).json();
      for (const v of views) expect(v.patientId).toBe(otherPatient.id);
    });
    it('an unlinked caregiver gets no coordinates', async () => {
      await call('/readings', patient, { readings: [reading()] });
      const res = await call('/location', unlinkedCaregiver);
      expect(await res.json()).toEqual({ location: null });
    });
    it('ignores a patientId in the POST body: a patient can only write their own location', async () => {
      await call('/readings', patient, {
        patientId: otherPatient.id,
        readings: [reading(0, 12.3)],
      });
      expect((await (await call('/location', otherCaregiver)).json()).location).toBeNull();
      expect((await (await call('/location', caregiver)).json()).location.lat).toBe(12.3);
    });
  });

  describe('contract (LocationReadContract)', () => {
    const svc = () => getRuntime().service.contract;

    it('fails closed with no grant, and audits the denied read', async () => {
      await call('/readings', patient, { readings: [reading()] });
      const out = await svc().getLastKnown({
        patientId: patient.id,
        requesterId: 'someone',
        purpose: 'lost_button',
      });
      expect(out).toBeNull();
      expect(getRuntime().store.listAudit(patient.id, 1)[0]).toMatchObject({
        requesterId: 'someone',
        purpose: 'lost_button',
        outcome: 'denied',
      });
    });

    it('serves an allowed requester and audits the purpose', async () => {
      await call('/readings', patient, { readings: [reading()] });
      getRuntime().readers.add(readerKey(caregiver.id, patient.id));
      const out = await svc().getLastKnown({
        patientId: patient.id,
        requesterId: caregiver.id,
        purpose: 'lost_button',
      });
      expect(out).toMatchObject({ lat: 40.71, stale: false });
      expect(getRuntime().store.listAudit(patient.id, 1)[0]).toMatchObject({
        purpose: 'lost_button',
        outcome: 'served',
      });
    });

    it('keeps geofence specs and unsubscribes handlers', async () => {
      const off = svc().onGeofenceEvent(() => {});
      expect(typeof off).toBe('function');
      off();
      await svc().registerGeofence({
        id: 'z',
        patientId: patient.id,
        center: { lat: 0, lng: 0 },
        radiusM: 100,
      });
      await svc().removeGeofence('z');
    });
  });

  describe('demo mode', () => {
    it('demoSeed gives the caregiver and daughter a fresh reading, but not the friend', async () => {
      const world = buildDemoWorld(clock.now());
      expect(
        await seedDemo([manifest], { world, env: { DATA_MODE: 'demo', FEATURE_ALL: 'on' } }),
      ).toEqual(['location-tracking']);
      await seedDemo([manifest], { world, env: { DATA_MODE: 'demo', FEATURE_ALL: 'on' } }); // idempotent
      const demoApp = createApp({
        manifests: [manifest],
        verifier: fakeVerifier([world.caregiver, world.daughter, world.friend]),
        env: { FEATURE_ALL: 'on' },
      });
      const get = (u: typeof world.caregiver) =>
        demoApp.request('/api/location-tracking/location', { headers: bearer(u) });
      const ok = await (await get(world.caregiver)).json();
      expect(ok.location).toMatchObject({ lat: world.location.lastKnown.lat, stale: false });
      expect((await get(world.daughter)).status).toBe(200);
      expect((await get(world.friend)).status).toBe(403); // demo mode never weakens authorization
      const { views } = await (
        await demoApp.request('/api/location-tracking/views', { headers: bearer(world.caregiver) })
      ).json();
      expect(views.some((v: { id: string }) => v.id === 'demo-view-1')).toBe(true);
    });
  });

  describe('contract metadata', () => {
    it('manifest name matches folder and ships flagged off', () => {
      expect(manifest.name).toBe('location-tracking');
      expect(manifest.enabledByDefault).toBe(false);
    });
  });

  describe('flag off', () => {
    it('mounts no routes', async () => {
      const off = createApp({ manifests: [manifest], verifier: fakeVerifier([]), env: {} });
      for (const r of manifest.routes) {
        const path = `/api/${manifest.name}${r.path}`;
        expect((await off.request(path, { method: r.method })).status).toBe(404);
      }
    });
  });
});

describe('find-them session', () => {
  const post = (path: string, who?: (typeof users)[number]) =>
    app().request(`/api/location-tracking${path}`, {
      method: 'POST',
      headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
      body: '{}',
    });

  it('caregiver starts it, patient sees it, it expires on the server clock', async () => {
    expect((await (await post('/find', caregiver)).json()).active).toBe(true);
    expect((await (await call('/find', patient)).json()).active).toBe(true);
    clock.advance(11 * 60_000);
    expect((await (await call('/find', patient)).json()).active).toBe(false);
  });
  it('is audited once and the follow-up reads are not', async () => {
    await call('/readings', patient, { readings: [reading()] });
    await post('/find', caregiver);
    await call('/location', caregiver);
    await call('/location', caregiver);
    const views = (await (await call('/views', caregiver)).json()).views;
    expect(views.filter((v: { purpose: string }) => v.purpose === 'find_session')).toHaveLength(1);
    expect(views).toHaveLength(1);
  });
  it('patient can end it; patient and circle members cannot start it', async () => {
    expect((await post('/find', patient)).status).toBe(403);
    expect((await post('/find', daughter)).status).toBe(403);
    expect((await post('/find', friend)).status).toBe(403);
    expect((await post('/find')).status).toBe(401);
    await post('/find', caregiver);
    expect((await (await post('/find/stop', patient)).json()).active).toBe(false);
  });
  it('is scoped to the caller’s own patient', async () => {
    await post('/find', caregiver);
    expect((await (await call('/find', otherPatient)).json()).active).toBe(false);
    expect((await (await post('/find', unlinkedCaregiver)).json()).active).toBe(false);
  });
});
