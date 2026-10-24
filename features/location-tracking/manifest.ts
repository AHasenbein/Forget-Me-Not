import { defineFeature } from '@core/feature-registry/manifest';
import { ingestSchema } from './server/schema';

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
  ],
  nav: [],
  permissions: ['view_location'],
  events: { emits: [], consumes: [] },
  demoSeed: async ({ world }) => (await import('./demo/seed')).seedLocation(world),
  migrations: ['location-tracking__202610241800_init.sql'],
});
