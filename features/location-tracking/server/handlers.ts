import type { RouteContext } from '@core/feature-registry/manifest';
import { ingestSchema } from './schema';
import { getRuntime } from './runtime';

// Core guarantees `ctx.user` is set on non-public routes; the service still scopes by user.patientId.
const user = (ctx: RouteContext) => {
  if (!ctx.user) throw new Error('unauthenticated');
  return ctx.user;
};

export const postReadings = (ctx: RouteContext) =>
  getRuntime().service.ingest(user(ctx), ingestSchema.parse(ctx.body).readings);

export const getLocation = (ctx: RouteContext) => getRuntime().service.view(user(ctx));

export const getViews = (ctx: RouteContext) => getRuntime().service.views(user(ctx));
