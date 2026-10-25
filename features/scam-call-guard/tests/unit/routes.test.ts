import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoWorld, seedDemo } from '@core/demo';
import { createApp } from '@core/server/app';
import {
  FakeClock,
  bearer,
  createCircleMember,
  createLinkedPair,
  createMockAi,
  createMockNotifier,
  createPatient,
  createPrimaryCaregiver,
  createUnlinkedUser,
  fakeVerifier,
} from '@core/testing';
import manifest from '../../manifest';
import { resetRuntime, setCaregivers } from '../../runtime';

const clock = new FakeClock('2026-01-01T12:00:00Z');
const { patient, caregiver } = createLinkedPair();
const daughter = createCircleMember(patient, { locationGrant: true });
const otherCaregiver = createPrimaryCaregiver(createPatient());
const unlinked = createUnlinkedUser('patient');
const users = [patient, caregiver, daughter, otherCaregiver, unlinked];

let push: ReturnType<typeof createMockNotifier>;
const app = (env: Record<string, string> = { FEATURE_SCAM_CALL_GUARD: 'on' }) =>
  createApp({ manifests: [manifest], verifier: fakeVerifier(users), env });
const call = (method: 'GET' | 'POST', path: string, who?: (typeof users)[number], body?: unknown) =>
  app().request(`/api/scam-call-guard${path}`, {
    method,
    headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
const startCall = async () =>
  (await (await call('POST', '/calls', patient, { consent: true })).json()).call;

beforeEach(() => {
  clock.setTime('2026-01-01T12:00:00Z');
  push = createMockNotifier();
  resetRuntime({
    notifier: push,
    ai: createMockAi({ text: '{"verdict":"not_scam","summary":"ok"}', confidence: 0.95 }),
    recordingEnabled: true,
    now: clock.now,
  });
  setCaregivers(patient.id, [caregiver.id]);
});

describe('scam-call-guard routes', () => {
  it('happy path: start, stream, patient warned, caregiver notified, reads overview, reviews', async () => {
    const c = await startCall();
    const seg = await call('POST', `/calls/${c.id}/segments`, patient, {
      seq: 0,
      text: 'Buy gift cards and read me the numbers right now. This is the IRS.',
    });
    expect((await seg.json()).call.warning).toBe('danger');
    expect(push.sent).toHaveLength(1);
    expect((await call('POST', `/calls/${c.id}/end`, patient)).status).toBe(200);

    const list = await (await call('GET', '/calls', caregiver)).json();
    expect(list.calls[0].id).toBe(c.id);
    expect(list.calls[0]).not.toHaveProperty('summary'); // list holds no overview
    const d = await (await call('GET', `/calls/${c.id}`, caregiver)).json();
    expect(d.call.summarySource).toBe('ai');
    expect((await (await call('GET', '/views', caregiver)).json()).views).toHaveLength(1);
    expect(
      (await call('POST', `/calls/${c.id}/review`, caregiver, { outcome: 'confirmed_scam' }))
        .status,
    ).toBe(200);
  });

  it('rejects unauthenticated callers on every route', async () => {
    for (const [m, p] of [
      ['POST', '/calls'],
      ['POST', '/calls/x/segments'],
      ['POST', '/calls/x/end'],
      ['GET', '/calls'],
      ['GET', '/calls/x'],
      ['POST', '/calls/x/review'],
      ['GET', '/views'],
    ] as const)
      expect((await call(m, p)).status).toBe(401);
  });

  it('circle members are refused everywhere, even with grants', async () => {
    const c = await startCall();
    expect((await call('POST', '/calls', daughter, { consent: true })).status).toBe(403);
    expect(
      (await call('POST', `/calls/${c.id}/segments`, daughter, { seq: 0, text: 'x' })).status,
    ).toBe(403);
    expect((await call('GET', '/calls', daughter)).status).toBe(403);
    expect((await call('GET', `/calls/${c.id}`, daughter)).status).toBe(403);
    expect(
      (await call('POST', `/calls/${c.id}/review`, daughter, { outcome: 'false_alarm' })).status,
    ).toBe(403);
    expect((await call('GET', '/views', daughter)).status).toBe(403);
  });

  it('wrong role: the caregiver cannot stream, the patient cannot read overviews or review', async () => {
    const c = await startCall();
    expect((await call('POST', '/calls', caregiver, { consent: true })).status).toBe(403);
    expect(
      (await call('POST', `/calls/${c.id}/segments`, caregiver, { seq: 0, text: 'x' })).status,
    ).toBe(403);
    expect((await call('GET', `/calls/${c.id}`, patient)).status).toBe(403);
    expect((await call('GET', '/calls', patient)).status).toBe(403);
    expect(
      (await call('POST', `/calls/${c.id}/review`, patient, { outcome: 'false_alarm' })).status,
    ).toBe(403);
  });

  it("cross-user: another patient's caregiver gets 404 and sees nothing", async () => {
    const c = await startCall();
    expect((await call('GET', `/calls/${c.id}`, otherCaregiver)).status).toBe(404);
    expect(
      (await call('POST', `/calls/${c.id}/review`, otherCaregiver, { outcome: 'false_alarm' }))
        .status,
    ).toBe(404);
    expect((await (await call('GET', '/calls', otherCaregiver)).json()).calls).toEqual([]);
  });

  it('an unlinked patient is refused; consent is required; stray fields are rejected', async () => {
    expect((await call('POST', '/calls', unlinked, { consent: true })).status).toBe(403);
    expect((await call('POST', '/calls', patient, {})).status).toBe(400);
    expect((await call('POST', '/calls', patient, { consent: false })).status).toBe(400);
    expect((await call('POST', '/calls', patient, { consent: true, patientId: 'x' })).status).toBe(
      400,
    );
    const c = await startCall();
    expect(
      (await call('POST', `/calls/${c.id}/segments`, patient, { seq: 0, text: '' })).status,
    ).toBe(400);
    expect(
      (await call('POST', `/calls/${c.id}/segments`, patient, { seq: 0, text: 'a'.repeat(2001) }))
        .status,
    ).toBe(400);
  });

  it('CALL_RECORDING_ENABLED off: starting a session is refused', async () => {
    resetRuntime({ notifier: push, recordingEnabled: false, now: clock.now });
    expect((await call('POST', '/calls', patient, { consent: true })).status).toBe(403);
  });

  it('flag off => inert (404, no routes)', async () => {
    const res = await app({}).request('/api/scam-call-guard/calls', {
      method: 'POST',
      headers: { ...bearer(patient), 'content-type': 'application/json' },
      body: JSON.stringify({ consent: true }),
    });
    expect(res.status).toBe(404);
  });
});

describe('demo mode', () => {
  it('demoSeed gives the demo caregiver a past scam call overview; the friend cannot see it', async () => {
    resetRuntime({ now: clock.now });
    const world = buildDemoWorld(clock.now());
    const env = { DATA_MODE: 'demo', FEATURE_ALL: 'on' };
    expect(await seedDemo([manifest], { world, env })).toEqual(['scam-call-guard']);
    await seedDemo([manifest], { world, env }); // idempotent
    const demoApp = createApp({
      manifests: [manifest],
      verifier: fakeVerifier([world.patient, world.caregiver, world.friend]),
      env,
    });
    const get = (p: string, who: typeof world.caregiver) =>
      demoApp.request(`/api/scam-call-guard${p}`, { headers: bearer(who) });
    const list = await (await get('/calls', world.caregiver)).json();
    expect(list.calls).toHaveLength(1);
    expect(list.calls[0].warning).toBe('danger');
    const d = await (await get(`/calls/${world.scamCall.id}`, world.caregiver)).json();
    expect(d.call.summary).toBe(world.scamCall.summary);
    expect((await get('/calls', world.friend)).status).toBe(403);
  });
});
