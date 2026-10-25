import { z } from 'zod';
import { defineFeature, type RouteContext } from '@core/feature-registry/manifest';
import { REFRESH_EVERY_MS } from './constants';
import { messageInput } from './schemas';

type Handler = keyof typeof import('./routes');
// Lazy import keeps server-only code out of the app bundle (manifests are bundled into the app).
const lazy = (name: Handler) => async (c: RouteContext) => (await import('./routes'))[name](c);

/**
 * Morning paper: the first thing the patient sees is a short "newspaper" of gentle good news, opened by a message from
 * the caregiver (if they left one). Stories come from an allowlist of good-news RSS feeds (GOOD_NEWS_LIVE_FEEDS=on) or
 * canned demo stories, filtered for anything distressing.
 */
export default defineFeature({
  name: 'good-news',
  enabledByDefault: false,
  routes: [
    {
      method: 'GET',
      path: '/paper',
      access: { roles: ['patient', 'primary_caregiver'] },
      handler: lazy('paper'),
    },
    {
      method: 'GET',
      path: '/message',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('getMessage'),
    },
    {
      method: 'PUT',
      path: '/message',
      access: { roles: ['primary_caregiver'] },
      input: messageInput,
      handler: lazy('setMessage'),
    },
    {
      method: 'DELETE',
      path: '/message',
      access: { roles: ['primary_caregiver'] },
      handler: lazy('clearMessage'),
    },
  ],
  nav: [], // widgets live in ui/index.tsx
  jobs: [
    {
      name: 'good-news-refresh',
      everyMs: REFRESH_EVERY_MS,
      run: async () => void (await (await import('./runtime')).getService().refresh()),
    },
  ],
  permissions: ['good_news.read', 'good_news.message'],
  events: { emits: [], consumes: [] },
  migrations: ['good-news__202610250100_init.sql'],
  env: { GOOD_NEWS_LIVE_FEEDS: z.enum(['on', 'off']).default('off') },
  demoSeed: async ({ world }) => {
    (await import('./demo/seed')).seedGoodNews(world);
  },
});
