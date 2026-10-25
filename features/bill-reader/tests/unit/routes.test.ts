import { beforeEach, describe, expect, it } from 'vitest';
import { UNREADABLE } from '@core/ai/documents';
import { createApp } from '@core/server/app';
import {
  FakeClock,
  bearer,
  createCircleMember,
  createLinkedPair,
  createUnlinkedUser,
  fakeVerifier,
} from '@core/testing';
import manifest from '../../manifest';
import { resetRuntime } from '../../runtime';

const clock = new FakeClock('2026-10-24T12:00:00Z');
const { patient, caregiver } = createLinkedPair();
const daughter = createCircleMember(patient, { locationGrant: true });
const stranger = createUnlinkedUser();
const users = [patient, caregiver, daughter, stranger];
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

const water = {
  isBill: true,
  utility: 'water' as const,
  payee: 'Fictional Water Co',
  amountCents: 3150,
  dueDate: '2026-11-20',
  redFlags: [],
  confidence: 0.95,
};
const app = (flag = 'on') =>
  createApp({
    manifests: [manifest],
    verifier: fakeVerifier(users),
    env: { FEATURE_BILL_READER: flag },
  });
const call = (
  method: 'GET' | 'POST',
  who?: (typeof users)[number],
  body?: unknown,
  flag?: string,
) =>
  app(flag).request('/api/bill-reader/scans', {
    method,
    headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
const frames = [{ mediaType: 'image/jpeg', data: JPEG }];

beforeEach(() => {
  clock.setTime('2026-10-24T12:00:00Z');
  resetRuntime({ documents: { readBill: async () => water }, now: clock.now });
});

describe('routes', () => {
  it('patient scans, caregiver lists', async () => {
    const res = await call('POST', patient, { frames });
    expect(res.status).toBe(200);
    expect((await res.json()).scan).toMatchObject({
      outcome: 'read',
      amountCents: 3150,
      dueInDays: 27,
    });
    const list = await (await call('GET', caregiver)).json();
    expect(list.scans[0]).toMatchObject({ utility: 'water', source: 'ai' });
  });
  it('rejects bad input with 400: no frames, too many, unknown type, junk data, extra fields', async () => {
    for (const body of [
      {},
      { frames: [] },
      { frames: [frames[0], frames[0], frames[0]] },
      { frames: [{ mediaType: 'image/svg+xml', data: JPEG }] },
      { frames: [{ mediaType: 'image/jpeg', data: 'not base64!!' }] },
      { frames: [{ mediaType: 'image/jpeg', data: JPEG, extra: 1 }] },
      { frames, patientId: 'someone-else' },
    ])
      expect((await call('POST', patient, body)).status).toBe(400);
  });
  it('a picture whose bytes do not match its type is 400', async () => {
    expect(
      (await call('POST', patient, { frames: [{ mediaType: 'image/png', data: JPEG }] })).status,
    ).toBe(400);
  });
  it('an oversized body is 413', async () => {
    const big = 'A'.repeat(5_100_000);
    expect(
      (await call('POST', patient, { frames: [{ mediaType: 'image/jpeg', data: big }] })).status,
    ).toBe(413);
  });
  it('unauthenticated 401; wrong role / circle member / unlinked 403', async () => {
    expect((await call('POST', undefined, { frames })).status).toBe(401);
    expect((await call('GET', undefined)).status).toBe(401);
    for (const who of [caregiver, daughter, stranger])
      expect((await call('POST', who, { frames })).status).toBe(403);
    for (const who of [patient, daughter, stranger])
      expect((await call('GET', who)).status).toBe(403);
  });
  it('flag off => inert (404)', async () => {
    expect((await call('POST', patient, { frames }, 'off')).status).toBe(404);
    expect((await call('GET', caregiver, undefined, 'off')).status).toBe(404);
  });
  it('an unreadable picture still answers 200 with "unclear" (not a server error)', async () => {
    resetRuntime({ documents: { readBill: async () => UNREADABLE }, now: clock.now });
    const res = await call('POST', patient, { frames });
    expect(res.status).toBe(200);
    expect((await res.json()).scan.outcome).toBe('unclear');
  });
});
