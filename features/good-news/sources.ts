import { FEEDS, FETCH_TIMEOUT_MS, MAX_FEED_BYTES } from './constants';
import { selectStories } from './filter';
import { parseRss, type RawItem } from './rss';
import type { Story } from './schemas';

/** Where today's stories come from. Chosen once in runtime.ts; the service never knows which one it has. */
export interface NewsSource {
  readonly kind: 'feeds' | 'canned';
  stories(now: Date): Promise<Story[]>;
}

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_FEED_BYTES) throw new Error('feed too large');
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error('feed too large');
  return text;
}

/**
 * Reads the allowlisted feeds in parallel. One failing feed is skipped; if every feed fails it throws, so the
 * service keeps yesterday's paper (or shows "no paper today") instead of an empty one.
 */
export function createFeedSource(deps: { fetch: typeof fetch; feeds?: typeof FEEDS }): NewsSource {
  const feeds = deps.feeds ?? FEEDS;
  return {
    kind: 'feeds',
    async stories(now) {
      const results = await Promise.allSettled(
        feeds.map(async (f) => {
          const res = await deps.fetch(f.url, {
            headers: {
              accept: 'application/rss+xml, application/xml;q=0.9',
              'user-agent': 'ForgetMeNot/0.1',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!res.ok) throw new Error(`feed ${res.status}`);
          return parseRss(await readCapped(res), f.name, f.url);
        }),
      );
      const ok = results.filter(
        (r): r is PromiseFulfilledResult<RawItem[]> => r.status === 'fulfilled',
      );
      if (!ok.length) throw new Error('no feed reachable');
      return selectStories(
        ok.flatMap((r) => r.value),
        now,
      );
    },
  };
}

/** Fixed stories (demo, tests, and the offline fallback in demo mode). */
export function createCannedSource(build: (now: Date) => Story[]): NewsSource {
  return { kind: 'canned', stories: async (now) => build(now) };
}
