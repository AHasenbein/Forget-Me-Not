import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoWorld, demoProviders, seedDemo } from '@core/demo';
import { createApp } from '@core/server/app';
import manifest from '../../manifest';
import { resetRuntime } from '../../runtime';

const env = { DATA_MODE: 'demo', FEATURE_MONEY_CHECK: 'on' };
const world = buildDemoWorld();
const call = (method: 'GET' | 'POST', path: string, token: string, body?: unknown) =>
  createApp({ manifests: [manifest], verifier: demoProviders(world).verifier, env }).request(
    `/api/money-check${path}`,
    {
      method,
      headers: { authorization: `Bearer demo:${token}`, 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    },
  );

beforeEach(async () => {
  resetRuntime();
  await seedDemo([manifest], { world, env });
});

describe('demo mode', () => {
  it('the demo story works end to end: gift cards are stopped, the caregiver declines', async () => {
    const { request } = await (
      await call('POST', '/requests', 'patient', { kind: 'gift_card' })
    ).json();
    expect(request).toMatchObject({ level: 'stop', status: 'waiting' });
    const seen = await (await call('GET', '/requests/active', 'caregiver')).json();
    expect(seen.request.reasons).toEqual(['gift_card_payment']);
    await call('POST', `/requests/${request.id}/decide`, 'caregiver', { decision: 'decline' });
    expect((await (await call('GET', '/requests/active', 'patient')).json()).request.status).toBe(
      'dont_pay',
    );
  });

  it('the demo bill comes from the shared world and looks normal', async () => {
    await call('POST', '/requests', 'patient', { kind: 'bill' });
    const seen = await (await call('GET', '/requests/active', 'caregiver')).json();
    expect(seen.request.level).toBe('ok');
    expect(seen.bill.payee).toBe(world.bills.find((b) => !b.paid)!.payee);
  });

  it('demo does not weaken authorization: the friend and the daughter are refused', async () => {
    expect((await call('GET', '/requests/active', 'friend')).status).toBe(403);
    expect((await call('GET', '/requests/active', 'daughter')).status).toBe(403);
  });
});
