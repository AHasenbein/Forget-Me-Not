import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@core/server/app';
import { FakeClock, bearer, createLinkedPair, fakeVerifier } from '@core/testing';
import { MAX_BATCH, REPORT_INTERVAL_MS } from '../../constants';
import manifest from '../../manifest';
import { resetRuntime } from '../../server/runtime';
import { createHttpUploader } from '../../tracker/http';
import { MAX_QUEUE } from '../../tracker/queue';
import { createTracker } from '../../tracker/tracker';
import type { Fix, QueueStorage, Reading, UploadResult, Uploader } from '../../tracker/types';

const clock = new FakeClock('2026-01-01T12:00:00Z');
const fix = (over: Partial<Fix> = {}): Fix => ({
  lat: 40.7,
  lng: -74,
  accuracyM: 12,
  timestampMs: clock.now().getTime(),
  ...over,
});
const memoryStorage = (initial: Reading[] = []) => {
  const box = { saved: initial };
  const storage: QueueStorage = {
    load: async () => box.saved,
    save: async (r) => {
      box.saved = r;
    },
  };
  return { box, storage };
};
/** Scripted uploader: records every batch; results come from `script` (default ok). */
const scripted = (script: UploadResult[] = []) => {
  const sent: Reading[][] = [];
  let active = 0;
  let maxActive = 0;
  const uploader: Uploader = {
    async send(batch) {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      sent.push(batch);
      active--;
      return script.shift() ?? 'ok';
    },
  };
  return { uploader, sent, maxActive: () => maxActive };
};
const make = (script?: UploadResult[], storage = memoryStorage()) => {
  const up = scripted(script);
  const tracker = createTracker({
    uploader: up.uploader,
    storage: storage.storage,
    now: clock.now,
  });
  return { tracker, ...up, ...storage };
};

beforeEach(() => clock.setTime('2026-01-01T12:00:00Z'));

describe('tracker', () => {
  it('queues the first fix and uploads it', async () => {
    const t = make();
    expect(await t.tracker.onFix(fix())).toBe(true);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]![0]).toMatchObject({ lat: 40.7, lng: -74, accuracyM: 12, source: 'gps' });
    expect(t.tracker.getStatus()).toBe('ok');
    expect(t.tracker.pending()).toBe(0);
  });

  it('reports at most once per 5 minutes however often the OS delivers fixes', async () => {
    const t = make();
    await t.tracker.onFix(fix());
    clock.advance(REPORT_INTERVAL_MS - 1);
    expect(await t.tracker.onFix(fix())).toBe(false);
    clock.advance(1);
    expect(await t.tracker.onFix(fix())).toBe(true);
    expect(t.sent).toHaveLength(2);
  });

  it('keeps readings while offline and delivers them oldest first once back', async () => {
    const t = make(['retry', 'retry']);
    await t.tracker.onFix(fix({ lat: 1 }));
    clock.advance(REPORT_INTERVAL_MS);
    await t.tracker.onFix(fix({ lat: 2 }));
    expect(t.tracker.getStatus()).toBe('offline');
    expect(t.tracker.pending()).toBe(2);
    clock.advance(REPORT_INTERVAL_MS);
    await t.tracker.onFix(fix({ lat: 3 }));
    expect(t.tracker.getStatus()).toBe('ok');
    expect(t.sent.at(-1)!.map((r) => r.lat)).toEqual([1, 2, 3]);
    expect(t.tracker.pending()).toBe(0);
  });

  it('survives an app restart: unsent readings are reloaded and sent', async () => {
    const first = make(['retry']);
    await first.tracker.onFix(fix({ lat: 7 }));
    expect(first.box.saved).toHaveLength(1);
    const second = make([], { box: first.box, storage: first.storage });
    await second.tracker.flush();
    expect(second.sent[0]![0]!.lat).toBe(7);
    expect(first.box.saved).toHaveLength(0);
  });

  it('keeps data when the session expired, then delivers after login', async () => {
    const t = make(['unauthorized']);
    await t.tracker.onFix(fix());
    expect(t.tracker.getStatus()).toBe('signed_out');
    expect(t.tracker.pending()).toBe(1);
    await t.tracker.flush();
    expect(t.tracker.getStatus()).toBe('ok');
    expect(t.tracker.pending()).toBe(0);
  });

  it('drops a batch the server rejects so it cannot block the queue forever', async () => {
    const t = make(['rejected']);
    await t.tracker.onFix(fix());
    expect(t.tracker.pending()).toBe(0);
    clock.advance(REPORT_INTERVAL_MS);
    await t.tracker.onFix(fix());
    expect(t.sent).toHaveLength(2);
  });

  it('never sends more than the server accepts per request', async () => {
    const t = make(Array(5).fill('retry'));
    for (let i = 0; i < 120; i++) {
      await t.tracker.onFix(fix({ lat: 10 + i / 100 }));
      clock.advance(REPORT_INTERVAL_MS);
    }
    await t.tracker.flush();
    expect(Math.max(...t.sent.map((b) => b.length))).toBeLessThanOrEqual(MAX_BATCH);
    expect(t.tracker.pending()).toBe(0);
  });

  it('bounds the queue to about a day, dropping the oldest', async () => {
    const t = make(Array(MAX_QUEUE + 20).fill('retry'));
    for (let i = 0; i < MAX_QUEUE + 20; i++) {
      await t.tracker.onFix(fix({ lat: 1 + i / 1000 }));
      clock.advance(REPORT_INTERVAL_MS);
    }
    expect(t.tracker.pending()).toBe(MAX_QUEUE);
  });

  it('ignores invalid and mocked fixes', async () => {
    const t = make();
    for (const bad of [
      fix({ lat: 91 }),
      fix({ lng: -181 }),
      fix({ lat: Number.NaN }),
      fix({ mocked: true }),
    ])
      expect(await t.tracker.onFix(bad)).toBe(false);
    expect(t.sent).toHaveLength(0);
  });

  it('clamps a future device timestamp and a missing accuracy', async () => {
    const t = make();
    await t.tracker.onFix(fix({ timestampMs: clock.now().getTime() + 3_600_000, accuracyM: null }));
    expect(t.sent[0]![0]).toMatchObject({
      recordedAt: clock.now().toISOString(),
      accuracyM: 10_000,
    });
  });

  it('runs one upload at a time even when triggered repeatedly', async () => {
    const t = make();
    await Promise.all([t.tracker.onFix(fix()), t.tracker.flush(), t.tracker.flush()]);
    expect(t.maxActive()).toBe(1);
  });

  it('keeps tracking when storage fails', async () => {
    const broken: QueueStorage = {
      load: async () => {
        throw new Error('disk');
      },
      save: async () => {
        throw new Error('disk');
      },
    };
    const up = scripted();
    const tracker = createTracker({ uploader: up.uploader, storage: broken, now: clock.now });
    expect(await tracker.onFix(fix())).toBe(true);
    expect(up.sent).toHaveLength(1);
  });
});

describe('http uploader', () => {
  const res = (status: number) => async () => new Response('{}', { status });
  const upload = (fetchImpl: typeof fetch, token: string | null = 't') =>
    createHttpUploader({ baseUrl: 'http://x', getToken: async () => token, fetchImpl }).send([]);

  it.each([
    [200, 'ok'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [400, 'rejected'],
    [413, 'rejected'],
    [500, 'retry'],
    [503, 'retry'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    expect(await upload(res(status) as unknown as typeof fetch)).toBe(expected);
  });

  it('treats a network failure as retry and a missing token as unauthorized', async () => {
    const down = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await upload(down)).toBe('retry');
    expect(await upload(res(200) as unknown as typeof fetch, null)).toBe('unauthorized');
  });
});

describe('tracker -> API (end to end, no network)', () => {
  it('the caregiver sees the newest reading after an offline flush', async () => {
    const { patient, caregiver } = createLinkedPair();
    resetRuntime(clock.now);
    const app = createApp({
      manifests: [manifest],
      verifier: fakeVerifier([patient, caregiver]),
      env: { FEATURE_LOCATION_TRACKING: 'on' },
    });
    const fetchImpl = ((url: string, init: RequestInit) =>
      app.request(new URL(url).pathname, init)) as unknown as typeof fetch;
    const tracker = createTracker({
      uploader: createHttpUploader({
        baseUrl: 'http://api',
        getToken: async () => bearer(patient).authorization.slice(7),
        fetchImpl,
      }),
      storage: memoryStorage().storage,
      now: clock.now,
    });
    await tracker.onFix(fix({ lat: 40.1 }));
    clock.advance(REPORT_INTERVAL_MS);
    await tracker.onFix(fix({ lat: 40.2 }));
    const res = await app.request('/api/location-tracking/location', {
      headers: bearer(caregiver),
    });
    expect((await res.json()).location).toMatchObject({ lat: 40.2, stale: false });
  });
});
