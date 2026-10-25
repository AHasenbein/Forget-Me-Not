import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@core/server/app';
import { EventBus } from '@core/events/bus';
import {
  bearer,
  createCircleMember,
  createLinkedPair,
  createUnlinkedUser,
  fakeVerifier,
} from '@core/testing';
import { DEMO_FRAMES } from '@core/demo/sample-frames';
import { setVisionOutcome } from '@core/demo/vision';
import manifest from '../../manifest';
import { resetRuntime } from '../../runtime';

const NY = 'America/New_York';
const body = { kind: 'pill', localTime: '08:00', timeZone: NY };

function setup() {
  resetRuntime();
  const a = createLinkedPair();
  const b = createLinkedPair();
  const member = createCircleMember(a.patient, { locationGrant: true });
  const stranger = createUnlinkedUser('primary_caregiver');
  const users = [a.patient, a.caregiver, b.patient, b.caregiver, member, stranger];
  const app = createApp({
    manifests: [manifest],
    verifier: fakeVerifier(users),
    bus: new EventBus(),
    env: { FEATURE_REMINDERS: 'on' },
  });
  const call = (path: string, user: { id: string } | null, method = 'GET', json?: unknown) =>
    app.request(`/api/reminders${path}`, {
      method,
      headers: { ...(user ? bearer(user as never) : {}), 'content-type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  const app_bare = (path: string, user: { id: string }) =>
    app.request(`/api/reminders${path}`, { method: 'POST', headers: bearer(user as never) });
  return { a, b, member, stranger, call, app_bare };
}

describe('reminders routes (authz + wiring)', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => void (t = setup()));

  it('every route requires a token', async () => {
    for (const r of manifest.routes) {
      const res = await t.call(
        r.path.replace(':id', 'x'),
        null,
        r.method,
        r.method === 'GET' ? undefined : {},
      );
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it('circle members get 403 on every route, even with a location grant', async () => {
    for (const r of manifest.routes) {
      const res = await t.call(
        r.path.replace(':id', 'x'),
        t.member,
        r.method,
        r.method === 'GET' ? undefined : {},
      );
      expect(res.status, `${r.method} ${r.path}`).toBe(403);
    }
  });

  it('caregiver creates a schedule; patient sees it and confirms with an EMPTY body', async () => {
    const created = await t.call('/schedules', t.a.caregiver, 'POST', body);
    expect(created.status).toBe(200);
    const { id: scheduleId } = (await created.json()) as { id: string };
    expect(scheduleId).toBeTruthy();
    const patientView = (await (await t.call('/schedules', t.a.patient)).json()) as unknown[];
    expect(patientView).toHaveLength(1);
    // bare POST (no body at all) must work, not 400
    const res = await t.app_bare('/occurrences/none/confirm', t.a.patient);
    expect(res.status).toBe(404);
  });

  it('patient cannot create schedules (403); unlinked caregiver gets 403', async () => {
    expect((await t.call('/schedules', t.a.patient, 'POST', body)).status).toBe(403);
    expect((await t.call('/schedules', t.stranger, 'POST', body)).status).toBe(403);
  });

  it('validates input: bad time, unknown zone, unknown field, empty patch', async () => {
    const bad = [
      { ...body, localTime: '25:00' },
      { ...body, timeZone: 'Mars/Olympus' },
      { ...body, kind: 'meds' },
      { ...body, label: 'Warfarin 5mg' }, // no free-text: medication names are health data
    ];
    for (const b of bad)
      expect((await t.call('/schedules', t.a.caregiver, 'POST', b)).status).toBe(400);
    const id = (
      (await (await t.call('/schedules', t.a.caregiver, 'POST', body)).json()) as { id: string }
    ).id;
    expect((await t.call(`/schedules/${id}`, t.a.caregiver, 'PATCH', {})).status).toBe(400);
  });

  it("another patient's caregiver and patient get 404 on schedules and occurrences", async () => {
    const id = (
      (await (await t.call('/schedules', t.a.caregiver, 'POST', body)).json()) as { id: string }
    ).id;
    expect(
      (await t.call(`/schedules/${id}`, t.b.caregiver, 'PATCH', { paused: true })).status,
    ).toBe(404);
    expect((await t.call(`/schedules/${id}`, t.b.caregiver, 'DELETE')).status).toBe(404);
    const theirs = (await (await t.call('/today', t.b.caregiver)).json()) as {
      occurrences: unknown[];
    };
    expect(theirs.occurrences).toEqual([]);
  });

  it('HttpError statuses reach the client with only a code', async () => {
    const res = await t.call('/occurrences/nope/snooze', t.a.patient, 'POST', {});
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('delete removes the schedule', async () => {
    const id = (
      (await (await t.call('/schedules', t.a.caregiver, 'POST', body)).json()) as { id: string }
    ).id;
    expect((await t.call(`/schedules/${id}`, t.a.caregiver, 'DELETE')).status).toBe(200);
    expect(await (await t.call('/schedules', t.a.caregiver)).json()).toEqual([]);
  });
});

describe('pill check routes', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => void (t = setup()));
  afterEach(() => setVisionOutcome('clear'));

  const localHm = (offsetMin: number) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: NY,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(Date.now() + offsetMin * 60_000));
  /** A pill due soon (inside the early window), already confirmed by the patient. */
  async function confirmedPill() {
    await t.call('/schedules', t.a.caregiver, 'POST', {
      kind: 'pill',
      localTime: localHm(10),
      timeZone: NY,
    });
    const today = (await (await t.call('/today', t.a.patient)).json()) as {
      occurrences: { id: string }[];
    };
    const id = today.occurrences[0]!.id;
    expect((await t.call(`/occurrences/${id}/confirm`, t.a.patient, 'POST', {})).status).toBe(200);
    return id;
  }
  const photos = { frames: DEMO_FRAMES };

  it('every outcome gives the patient the same 200 {ok:true}; only the caregiver sees the result', async () => {
    const bodies: unknown[] = [];
    for (const outcome of ['clear', 'unclear', 'not_taken'] as const) {
      t = setup();
      setVisionOutcome(outcome);
      const id = await confirmedPill();
      const res = await t.call(`/occurrences/${id}/pill-check`, t.a.patient, 'POST', photos);
      expect(res.status).toBe(200);
      bodies.push(await res.json());
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(bodies[0]).toEqual({ ok: true });
  });

  it('frames: caregiver only (404 for another patient), patient/circle denied, audit is visible', async () => {
    setVisionOutcome('unclear');
    const id = await confirmedPill();
    await t.call(`/occurrences/${id}/pill-check`, t.a.patient, 'POST', photos);
    expect((await t.call(`/occurrences/${id}/frames`, t.a.patient)).status).toBe(403);
    expect((await t.call(`/occurrences/${id}/frames`, t.member)).status).toBe(403);
    expect((await t.call(`/occurrences/${id}/frames`, t.b.caregiver)).status).toBe(404);
    const ok = await t.call(`/occurrences/${id}/frames`, t.a.caregiver);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { frames: unknown[] }).frames).toHaveLength(3);
    const audit = (await (await t.call('/audit', t.a.caregiver)).json()) as {
      action: string;
      byYou: boolean;
    }[];
    expect(audit.map((a) => a.action)).toEqual(['pill_frames_viewed']);
    expect(audit[0]!.byYou).toBe(true); // the caregiver's own view: full record only, not "Worth knowing"
    expect((await t.call('/audit', t.a.patient)).status).toBe(403);
  });

  it('review: caregiver approves, patient cannot', async () => {
    setVisionOutcome('unclear');
    const id = await confirmedPill();
    await t.call(`/occurrences/${id}/pill-check`, t.a.patient, 'POST', photos);
    expect(
      (await t.call(`/occurrences/${id}/review`, t.a.patient, 'POST', { decision: 'approve' }))
        .status,
    ).toBe(403);
    expect(
      (await t.call(`/occurrences/${id}/review`, t.a.caregiver, 'POST', { decision: 'maybe' }))
        .status,
    ).toBe(400);
    expect(
      (await t.call(`/occurrences/${id}/review`, t.a.caregiver, 'POST', { decision: 'approve' }))
        .status,
    ).toBe(200);
    expect(
      (await t.call(`/occurrences/${id}/review`, t.a.caregiver, 'POST', { decision: 'approve' }))
        .status,
    ).toBe(409);
  });

  it('uploads are bounded: >5 photos, unknown types, non-base64 and oversize bodies are rejected', async () => {
    const id = await confirmedPill();
    const send = (b: unknown) => t.call(`/occurrences/${id}/pill-check`, t.a.patient, 'POST', b);
    expect((await send({ frames: [...DEMO_FRAMES, ...DEMO_FRAMES] })).status).toBe(400); // 6
    expect(
      (await send({ frames: [{ mediaType: 'image/svg+xml', data: DEMO_FRAMES[0]!.data }] })).status,
    ).toBe(400);
    expect(
      (await send({ frames: [{ mediaType: 'image/png', data: '<svg onload=alert(1)>' }] })).status,
    ).toBe(400);
    expect(
      (await send({ frames: [{ mediaType: 'image/png', data: 'A'.repeat(4_000_000) }] })).status,
    ).toBe(413);
    expect((await send({ frames: [], extra: true })).status).toBe(400);
  });

  it('the caregiver, circle members and strangers cannot submit photos', async () => {
    const id = await confirmedPill();
    expect((await t.call(`/occurrences/${id}/pill-check`, null, 'POST', photos)).status).toBe(401);
    expect(
      (await t.call(`/occurrences/${id}/pill-check`, t.a.caregiver, 'POST', photos)).status,
    ).toBe(403);
    expect((await t.call(`/occurrences/${id}/pill-check`, t.member, 'POST', photos)).status).toBe(
      403,
    );
    expect(
      (await t.call(`/occurrences/${id}/pill-check`, t.b.patient, 'POST', photos)).status,
    ).toBe(404);
  });
});

describe('flag off', () => {
  it('mounts nothing: every route is 404 even with a valid caregiver', async () => {
    resetRuntime();
    const { caregiver } = createLinkedPair();
    const app = createApp({ manifests: [manifest], verifier: fakeVerifier([caregiver]), env: {} });
    const res = await app.request('/api/reminders/today', { headers: bearer(caregiver) });
    expect(res.status).toBe(404);
  });
});
