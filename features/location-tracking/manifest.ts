import { defineFeature } from '@core/feature-registry/manifest';
import { emptySchema, ingestSchema } from './server/schema';

/**
 * Manifest for `location-tracking`. Auto-discovered: never edit a shared router/nav/config to add it.
 * Ships OFF (enabledByDefault: false). Turn on locally with FEATURE_LOCATION_TRACKING=on.
 * Server-only code is lazy-imported so it stays out of the app bundle.
 */
export default defineFeature({
  name: 'location-tracking',
  enabledByDefault: false,
  routes: [
    {
      method: 'POST',
      path: '/readings',
      access: { roles: ['patient'] },
      input: ingestSchema,
      handler: async (ctx) => (await import('./server/handlers')).postReadings(ctx),
    },
    {
      method: 'GET',
      path: '/location',
      access: { roles: ['primary_caregiver', 'circle_member'], circlePermission: 'view_location' },
      handler: async (ctx) => (await import('./server/handlers')).getLocation(ctx),
    },
    {
      method: 'GET',
      path: '/views',
      access: { roles: ['primary_caregiver'] },
      handler: async (ctx) => (await import('./server/handlers')).getViews(ctx),
    },
    {
      method: 'POST',
      path: '/find',
      access: { roles: ['primary_caregiver'] },
      input: emptySchema,
      handler: async (ctx) => (await import('./server/handlers')).startFind(ctx),
    },
    {
      method: 'POST',
      path: '/find/stop',
      access: { roles: ['primary_caregiver', 'patient'] },
      input: emptySchema,
      handler: async (ctx) => (await import('./server/handlers')).stopFind(ctx),
    },
    {
      method: 'GET',
      path: '/find',
      access: { roles: ['primary_caregiver', 'patient'] },
      handler: async (ctx) => (await import('./server/handlers')).getFind(ctx),
    },
  ],
  nav: [],
  permissions: ['view_location'],
  events: { emits: [], consumes: [] },
  // Demo "Reset": forget device readings, find sessions and audit rows, then demoSeed runs again.
  demoReset: async () => void (await import('./server/runtime')).resetRuntime(),
  demoSeed: async ({ world }) => (await import('./demo/seed')).seedLocation(world),
  migrations: ['location-tracking__202610241800_init.sql'],
});
