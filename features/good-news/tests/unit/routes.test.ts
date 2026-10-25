import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDemoWorld, seedDemo } from '@core/demo';
import { createApp } from '@core/server/app';
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
import manifest from '../../manifest';
import { resetRuntime } from '../../runtime';
import { createCannedSource } from '../../sources';

const clock = new FakeClock('2026-10-25T09:00:00Z');
const { patient, caregiver } = createLinkedPair();
const daughter = createCircleMember(patient, { locationGrant: true });
const otherCaregiver = createPrimaryCaregiver(createPatient());
const unlinked = createUnlinkedUser('primary_caregiver');
const users = [patient, caregiver, daughter, otherCaregiver, unlinked];

const app = (env: Record<string, string> = { FEATURE_GOOD_NEWS: 'on' }) =>
  createApp({ manifests: [manifest], verifier: fakeVerifier(users), env });
const call = (method: string, path: string, who?: (typeof users)[number], body?: unknown) =>
  app().request(`/api/good-news${path}`, {
    method,
    headers: { ...(who ? bearer(who) : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  clock.setTime('2026-10-25T09:00:00Z');
  resetRuntime({
    source: createCannedSource(() => [
      {
        id: 's1',
        headline: 'Ducks cross the road',
        summary: '',
        source: 'S',
        publishedAt: null,
        url: null,
      },
    ]),
    fallback: null,
    now: clock.now,
  });
});

describe('good-news routes', () => {
  it('happy path: caregiver leaves a note; the patient sees it first, then the news', async () => {
    expect((await call('PUT', '/message', caregiver, { text: 'See you at lunch!' })).status).toBe(
      200,
    );
    const paper = await (await call('GET', '/paper', patient)).json();
    expect(paper.message.text).toBe('See you at lunch!');
    expect(paper.stories[0].headline).toBe('Ducks cross the road');
    expect((await call('GET', '/paper', caregiver)).status).toBe(200); // caregiver can preview
  });

  it('rejects unauthenticated callers on every route', async () => {
    for (const [m, p] of [
      ['GET', '/paper'],
      ['GET', '/message'],
      ['PUT', '/message'],
      ['DELETE', '/message'],
    ] as const)
      expect((await call(m, p, undefined, m === 'PUT' ? { text: 'x' } : undefined)).status).toBe(
        401,
      );
  });

  it('only the primary caregiver writes; patient and circle members cannot, even with grants', async () => {
    for (const who of [patient, daughter]) {
      expect((await call('PUT', '/message', who, { text: 'hi' })).status).toBe(403);
      expect((await call('DELETE', '/message', who)).status).toBe(403);
      expect((await call('GET', '/message', who)).status).toBe(403);
    }
    expect((await call('GET', '/paper', daughter)).status).toBe(403);
  });

  it("cross-user: another patient's caregiver neither sees nor changes this note", async () => {
    await call('PUT', '/message', caregiver, { text: 'Mine' });
    expect((await (await call('GET', '/message', otherCaregiver)).json()).message).toBeNull();
    await call('DELETE', '/message', otherCaregiver);
    expect((await (await call('GET', '/paper', patient)).json()).message.text).toBe('Mine');
  });

  it('unlinked users are refused; messages are validated (empty, too long, stray fields)', async () => {
    expect((await call('PUT', '/message', unlinked, { text: 'hi' })).status).toBe(403);
    expect((await call('PUT', '/message', caregiver, { text: '   ' })).status).toBe(400);
    expect((await call('PUT', '/message', caregiver, { text: 'a'.repeat(501) })).status).toBe(400);
    expect((await call('PUT', '/message', caregiver, { text: 'hi', patientId: 'x' })).status).toBe(
      400,
    );
  });

  it('flag off => inert', async () => {
    const res = await app({}).request('/api/good-news/paper', { headers: bearer(patient) });
    expect(res.status).toBe(404);
  });
});

describe('demo mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads the real feeds by default, with links to the full stories (network stubbed)', async () => {
    vi.stubEnv('GOOD_NEWS_LIVE_FEEDS', undefined);
    vi.stubGlobal('fetch', async (url: string) => {
      const host = new URL(url).origin;
      return new Response(
        `<rss><channel><item><title>Kind neighbour fixes bikes at ${host}</title><link>${host}/bikes/</link><pubDate>${new Date(clock.now().getTime() - 3_600_000).toUTCString()}</pubDate></item></channel></rss>`,
      );
    });
    resetRuntime({ now: clock.now });
    const world = buildDemoWorld(clock.now());
    const demoApp = createApp({
      manifests: [manifest],
      verifier: fakeVerifier([world.patient]),
      env: { DATA_MODE: 'demo', FEATURE_ALL: 'on' },
    });
    const paper = await (
      await demoApp.request('/api/good-news/paper', { headers: bearer(world.patient) })
    ).json();
    expect(paper.editionId).toContain('-feeds-');
    expect(paper.stories.length).toBeGreaterThan(0);
    for (const s of paper.stories) expect(s.url).toMatch(/^https:\/\/[^/]+\/bikes\/$/);
  });

  it('demoSeed leaves a caregiver note and canned stories; idempotent', async () => {
    vi.stubEnv('GOOD_NEWS_LIVE_FEEDS', 'off'); // no network in tests
    resetRuntime({ now: clock.now }); // real demo wiring: canned stories, canned fallback
    const world = buildDemoWorld(clock.now());
    const env = { DATA_MODE: 'demo', FEATURE_ALL: 'on' };
    expect(await seedDemo([manifest], { world, env })).toEqual(['good-news']);
    await seedDemo([manifest], { world, env });
    const demoApp = createApp({
      manifests: [manifest],
      verifier: fakeVerifier([world.patient, world.friend]),
      env,
    });
    const get = (who: typeof world.patient) =>
      demoApp.request('/api/good-news/paper', { headers: bearer(who) });
    const paper = await (await get(world.patient)).json();
    expect(paper.message.text).toContain(world.profile.firstName);
    expect(paper.stories.length).toBeGreaterThan(3);
    expect(paper.stories.every((s: { url: unknown }) => s.url === null)).toBe(true); // fictional: no links
    expect((await get(world.friend)).status).toBe(403);
  });
});
