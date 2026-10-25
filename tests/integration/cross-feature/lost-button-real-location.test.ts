import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoWorld, demoVerifier, seedDemo } from '@core/demo';
import { getProviders } from '@core/providers';
import { resetOwned } from '@core/providers/owned';
import { createApp } from '@core/server/app';
import lostButton from '../../../features/lost-button/manifest';
import { resetRuntime as resetLost } from '../../../features/lost-button/runtime';
import location from '../../../features/location-tracking/manifest';
import { resetRuntime as resetLocation } from '../../../features/location-tracking/server/runtime';

/**
 * End to end through the real app: the "I'm lost" alert shows where the patient's device actually is (the reading it
 * posted to location-tracking), not the canned demo position. lost-button still only uses `getProviders().location`.
 */
const world = buildDemoWorld();
const there = { lat: 41.2, lng: -73.1 }; // fictional, far from the demo park
const manifests = [location, lostButton];

async function boot(env: Record<string, string>) {
  const app = createApp({ manifests, verifier: demoVerifier(world), env });
  await seedDemo(manifests, { world, env });
  const call = (path: string, token: string, body?: unknown) =>
    app.request(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer demo:${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { call };
}

beforeEach(() => {
  resetOwned();
  resetLost();
  resetLocation();
});

describe('lost-button shows the real location from location-tracking', () => {
  it('the caregiver sees the position the device reported, and the read is in "who looked"', async () => {
    const { call } = await boot({ FEATURE_LOCATION_TRACKING: 'on', FEATURE_LOST_BUTTON: 'on' });
    const posted = await call('/api/location-tracking/readings', 'patient', {
      readings: [{ ...there, accuracyM: 8, recordedAt: new Date().toISOString(), source: 'gps' }],
    });
    expect(posted.status).toBe(200);
    expect((await call('/api/lost-button/alerts', 'patient', {})).status).toBe(200);

    const seen = await (await call('/api/lost-button/alerts/active', 'caregiver')).json();
    expect(seen.location).toMatchObject({ ...there, accuracyM: 8, stale: false });

    const { views } = await (await call('/api/location-tracking/views', 'caregiver')).json();
    expect(views[0]).toMatchObject({ purpose: 'lost_button', outcome: 'served' });
  });

  it('before any device report it shows the demo seed, still served by location-tracking', async () => {
    const { call } = await boot({ FEATURE_LOCATION_TRACKING: 'on', FEATURE_LOST_BUTTON: 'on' });
    await call('/api/lost-button/alerts', 'patient', {});
    const seen = await (await call('/api/lost-button/alerts/active', 'caregiver')).json();
    expect(seen.location).toMatchObject({ lat: world.location.park.lat });
    const { views } = await (await call('/api/location-tracking/views', 'caregiver')).json();
    expect(views[0]).toMatchObject({ purpose: 'lost_button' });
  });

  it('location-tracking off: nothing is registered, lost-button falls back to the canned demo port', async () => {
    const { call } = await boot({ FEATURE_LOST_BUTTON: 'on' });
    expect(getProviders().location).not.toBe(undefined);
    await call('/api/lost-button/alerts', 'patient', {});
    const seen = await (await call('/api/lost-button/alerts/active', 'caregiver')).json();
    expect(seen.alert).toMatchObject({ status: 'active' });
    expect(seen.location).toMatchObject({ lat: world.location.park.lat });
  });
});
