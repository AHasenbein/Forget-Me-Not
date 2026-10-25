import type { AuthUser } from '@core/auth/types';
import type { RouteContext } from '@core/feature-registry/manifest';
import { getService } from './runtime';

// access (in the manifest) guarantees a user on every route here; the service re-checks role + patient scope.
const user = (c: RouteContext) => c.user as AuthUser;

export const paper = (c: RouteContext) => getService().paper(user(c));
export const getMessage = (c: RouteContext) => getService().getMessage(user(c));
export const setMessage = (c: RouteContext) =>
  getService().setMessage(user(c), (c.body as { text: string }).text);
export const clearMessage = (c: RouteContext) => getService().clearMessage(user(c));
