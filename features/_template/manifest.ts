import { defineFeature } from '@core/feature-registry/manifest';

/**
 * Manifest for `__FEATURE_NAME__`. Auto-discovered: never edit a shared router/nav/config to add it.
 * Ships OFF (enabledByDefault: false). Turn on locally with FEATURE___FEATURE_ENV__=on.
 */
export default defineFeature({
  name: '__FEATURE_NAME__',
  enabledByDefault: false,
  routes: [
    // Every route MUST declare `access`. Example:
    // { method: 'GET', path: '/status', access: { roles: ['patient', 'primary_caregiver'] }, handler: () => ({ ok: true }) },
    // Routes open to circle members need an explicit grant (or `circlePermission: null`), and should
    // lazy-import server-only code so it stays out of the app bundle:
    // { method: 'GET', path: '/where', access: { roles: ['primary_caregiver', 'circle_member'], circlePermission: 'view_location' },
    //   handler: async (ctx) => (await import('./server/where')).run(ctx) },
  ],
  nav: [],
  permissions: [],
  events: { emits: [], consumes: [] },
  // demoSeed: async ({ world }) => { /* seed canned data from world (fictional, idempotent) */ },
  migrations: [], // e.g. '__FEATURE_NAME_____202601011200_init.sql' (see CLAUDE.md)
  // env: { __FEATURE_ENV___API_KEY: z.string().min(1) }, // keys must start with __FEATURE_ENV___
});
