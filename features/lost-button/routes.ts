import type { AuthUser } from '@core/auth/types';
import type { RouteContext } from '@core/feature-registry/manifest';
import { getService } from './runtime';

// access (in the manifest) guarantees a user on every route here; the service re-checks role + patient scope.
const user = (c: RouteContext) => c.user as AuthUser;

export const press = (c: RouteContext) => getService().press(user(c));
export const active = (c: RouteContext) => getService().active(user(c));
export const acknowledge = (c: RouteContext) => getService().acknowledge(user(c), c.params.id!);
export const resolve = (c: RouteContext) => getService().resolve(user(c), c.params.id!);
