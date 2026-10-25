import { now } from '@core/clock';
import { isDemo } from '@core/config/data-mode';
import { buildDemoWorld } from '@core/demo/world';
import { cannedStories } from './demo/stories';
import { createGoodNewsService, type GoodNewsService } from './service';
import { createCannedSource, createFeedSource, type NewsSource } from './sources';
import { MemoryMessageStore } from './store';

/** Module-level wiring: handlers receive no dependencies, so the service is resolved here. */
export interface Overrides {
  source?: NewsSource;
  fallback?: NewsSource | null;
  now?: () => Date;
}

let service: GoodNewsService | undefined;
let store: MemoryMessageStore | undefined;
let overrides: Overrides = {};

const canned = createCannedSource((t) => cannedStories(t, buildDemoWorld(t).news));
const nothing = createCannedSource(() => []);

export function getStore(): MemoryMessageStore {
  // Fail loud: in live mode in-memory messages would silently vanish on restart.
  if (!isDemo()) throw new Error('good-news: no live message store yet');
  return (store ??= new MemoryMessageStore());
}

/**
 * Source: the real feeds unless GOOD_NEWS_LIVE_FEEDS=off, then canned stories in demo (none in live: canned stories
 * must never pass for real news). The canned fallback, used when the feeds fail, exists only in demo mode.
 */
export function getService(): GoodNewsService {
  service ??= createGoodNewsService({
    store: getStore(),
    source:
      overrides.source ??
      (process.env.GOOD_NEWS_LIVE_FEEDS !== 'off'
        ? createFeedSource({ fetch: (...a) => fetch(...a) })
        : isDemo()
          ? canned
          : nothing),
    fallback: overrides.fallback !== undefined ? overrides.fallback : isDemo() ? canned : null,
    now: () => (overrides.now ?? now)(),
  });
  return service;
}

/** Tests only. */
export function resetRuntime(next: Overrides = {}) {
  service = store = undefined;
  overrides = next;
}
