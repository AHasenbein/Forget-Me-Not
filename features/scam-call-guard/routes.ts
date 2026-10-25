import type { AuthUser } from '@core/auth/types';
import type { RouteContext } from '@core/feature-registry/manifest';
import { getService } from './runtime';
import type { Review } from './schemas';

// access (in the manifest) guarantees a user on every route here; the service re-checks role + patient scope.
const user = (c: RouteContext) => c.user as AuthUser;

export const start = (c: RouteContext) => getService().start(user(c));
export const segment = (c: RouteContext) =>
  getService().addSegment(user(c), c.params.id!, c.body as { seq: number; text: string });
export const end = (c: RouteContext) => getService().end(user(c), c.params.id!);
export const list = (c: RouteContext) => getService().list(user(c));
export const detail = (c: RouteContext) => getService().detail(user(c), c.params.id!);
export const review = (c: RouteContext) =>
  getService().review(user(c), c.params.id!, (c.body as { outcome: Review }).outcome);
export const views = (c: RouteContext) => getService().views(user(c));
