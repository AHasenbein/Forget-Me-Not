import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@core/server/app';
import {
  FakeClock,
  bearer,
  createCircleMember,
  createLinkedPair,
  createMockNotifier,
  createMockPlaid,
  createPatient,
  createPrimaryCaregiver,
  createUnlinkedUser,
  fakeVerifier,
} from '@core/testing';
import manifest from '../../manifest';
import { resetRuntime, setCaregivers } from '../../runtime';

const clock = new FakeClock('2026-01-01T12:00:00Z');
const { patient, caregiver } = createLinkedPair();
const daughter = createCircleMember(patient, {
  locationGrant: true,
  grants: ['receive_checkins', 'send_checkins', 'view_location', 'receive_safezone_alerts'],
});
const otherCaregiver = createPrimaryCaregiver(createPatient());
const unlinked = createUnlinkedUser('patient');
const users = [patient, caregiver, daughter, otherCaregiver, unlinked];

const app = () =>
  createApp({
    manifests: [manifest],
    verifier: fakeVerifier(users),
    env: { FEATURE_MONEY_CHECK: 'on' },
  });
const call = (method: 'GET' | 'POST', path: string, who?: (typeof users)[number], body?: unknown) =>
  app().request(`/api/money-check${path}`, {
    method,
    headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

beforeEach(() => {
  clock.setTime('2026-01-01T12:00:00Z');
  resetRuntime({
    notifier: createMockNotifier(),
    plaid: createMockPlaid([
      { id: 'b1', payee: 'Fictional Water', amountCents: 3150, paid: false },
    ]),
    now: clock.now,
  });
  setCaregivers(patient.id, [caregiver.id]);
});

describe('money-check routes', () => {
  it('happy path: ask, caregiver sees it, approves, patient is told', async () => {
    const asked = await call('POST', '/requests', patient, { kind: 'bill' });
    expect(asked.status).toBe(200);
    const { request } = await asked.json();
    const seen = await (await call('GET', '/requests/active', caregiver)).json();
    expect(seen.request.id).toBe(request.id);
    expect(seen.bill).toMatchObject({ payee: 'Fictional Water' });
    expect(
      (await call('POST', `/requests/${request.id}/decide`, caregiver, { decision: 'approve' }))
        .status,
    ).toBe(200);
    expect((await (await call('GET', '/requests/active', patient)).json()).request.status).toBe(
      'ok_to_go',
    );
    expect((await (await call('GET', '/audit', caregiver)).json()).entries).toHaveLength(2);
  });

  it('every route rejects unauthenticated callers', async () => {
    for (const r of manifest.routes) {
      const path = r.path.replace(':id', 'x');
      expect((await call(r.method as 'GET' | 'POST', path)).status).toBe(401);
    }
  });

  it('every route rejects an unlinked user', async () => {
    const stranger = createUnlinkedUser('primary_caregiver');
    users.push(stranger);
    for (const r of manifest.routes) {
      const path = r.path.replace(':id', 'x');
      const who =
        r.access && 'roles' in r.access && r.access.roles.includes('patient') ? unlinked : stranger;
      const res = await call(r.method as 'GET' | 'POST', path, who, {
        kind: 'bill',
        decision: 'approve',
      });
      expect([400, 403, 404]).toContain(res.status);
    }
  });

  it('circle members get 403 on every route, even with a location grant', async () => {
    for (const r of manifest.routes) {
      const res = await call(r.method as 'GET' | 'POST', r.path.replace(':id', 'x'), daughter, {
        kind: 'bill',
        decision: 'approve',
      });
      expect(res.status).toBe(403);
    }
  });

  it('the patient cannot approve or read the audit', async () => {
    const { request } = await (await call('POST', '/requests', patient, { kind: 'bill' })).json();
    expect(
      (await call('POST', `/requests/${request.id}/decide`, patient, { decision: 'approve' }))
        .status,
    ).toBe(403);
    expect((await call('GET', '/audit', patient)).status).toBe(403);
  });

  it("a caregiver cannot ask on the patient's behalf", async () => {
    expect((await call('POST', '/requests', caregiver, { kind: 'bill' })).status).toBe(403);
  });

  it("another patient's caregiver gets 404 and sees nothing", async () => {
    const { request } = await (await call('POST', '/requests', patient, { kind: 'bill' })).json();
    expect(
      (
        await call('POST', `/requests/${request.id}/decide`, otherCaregiver, {
          decision: 'approve',
        })
      ).status,
    ).toBe(404);
    expect(
      (await (await call('GET', '/requests/active', otherCaregiver)).json()).request,
    ).toBeNull();
  });

  it('rejects bad input: unknown kind, extra fields (a client-sent patientId or amount), bad decision', async () => {
    expect((await call('POST', '/requests', patient, { kind: 'crypto' })).status).toBe(400);
    expect(
      (await call('POST', '/requests', patient, { kind: 'bill', patientId: 'x', amountCents: 1 }))
        .status,
    ).toBe(400);
    const { request } = await (await call('POST', '/requests', patient, { kind: 'bill' })).json();
    expect(
      (await call('POST', `/requests/${request.id}/decide`, caregiver, { decision: 'maybe' }))
        .status,
    ).toBe(400);
  });

  it('a second decision is a 409', async () => {
    const { request } = await (
      await call('POST', '/requests', patient, { kind: 'gift_card' })
    ).json();
    await call('POST', `/requests/${request.id}/decide`, caregiver, { decision: 'decline' });
    const other = createPrimaryCaregiver(patient);
    users.push(other);
    expect(
      (await call('POST', `/requests/${request.id}/decide`, other, { decision: 'approve' })).status,
    ).toBe(409);
  });
});

describe('contract', () => {
  it('manifest name matches folder, ships flagged off, and every route declares access', () => {
    expect(manifest.name).toBe('money-check');
    expect(manifest.enabledByDefault).toBe(false);
    for (const r of manifest.routes) expect(r.access).toBeDefined();
  });
});

describe('flag off', () => {
  it('mounts no routes', async () => {
    const off = createApp({ manifests: [manifest], verifier: fakeVerifier(users), env: {} });
    for (const r of manifest.routes) {
      const res = await off.request(`/api/money-check${r.path.replace(':id', 'x')}`, {
        method: r.method,
        headers: bearer(patient),
      });
      expect(res.status).toBe(404);
    }
  });
});
