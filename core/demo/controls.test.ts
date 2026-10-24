import { afterEach, describe, expect, it } from 'vitest';
import { resetClock } from '../clock';
import { bearer, createCircleMember, createLinkedPair, fakeVerifier } from '../testing';
import { createDemoControls } from './controls';

describe('demo controls', () => {
  afterEach(() => {
    resetClock();
    delete process.env.DATA_MODE;
  });
  const { patient, caregiver } = createLinkedPair();
  const member = createCircleMember(patient, { locationGrant: true });
  const app = () =>
    createDemoControls({ manifests: [], verifier: fakeVerifier([patient, caregiver, member]) });
  const post = (path: string, who: typeof patient | null, body: unknown = {}) =>
    app().request(path, {
      method: 'POST',
      headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('speeds up and jumps time for patient/caregiver', async () => {
    expect((await post('/clock/speed', caregiver, { speed: 60 })).status).toBe(200);
    const res = await post('/clock/jump', patient, { minutes: 30 });
    expect(((await res.json()) as { speed: number }).speed).toBe(60);
  });
  it('rejects bad input, strangers and circle members', async () => {
    expect((await post('/clock/speed', caregiver, { speed: -1 })).status).toBe(400);
    expect((await post('/clock/jump', caregiver, { minutes: 'x' })).status).toBe(400);
    expect((await post('/clock/speed', null, { speed: 2 })).status).toBe(401);
    expect((await post('/clock/speed', member, { speed: 2 })).status).toBe(403);
  });
  it('is 404 outside demo mode (even with a valid caregiver)', async () => {
    process.env.DATA_MODE = 'live';
    expect((await post('/clock/speed', caregiver, { speed: 2 })).status).toBe(404);
    expect((await post('/reset', caregiver)).status).toBe(404);
  });
  it('reset returns to real time', async () => {
    await post('/clock/speed', caregiver, { speed: 600 });
    const res = await post('/reset', caregiver);
    expect(((await res.json()) as { speed: number }).speed).toBe(1);
  });
});
