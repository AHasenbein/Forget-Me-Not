import type { AuthUser } from '@core/auth/types';
import type { RouteContext } from '@core/feature-registry/manifest';
import { getService } from './runtime';
import type { createInput, decideInput } from './schemas';
import type { z } from 'zod';

// access (in the manifest) guarantees a user on every route here; the service re-checks role + patient scope.
const user = (c: RouteContext) => c.user as AuthUser;

export const create = (c: RouteContext) =>
  getService().create(user(c), c.body as z.infer<typeof createInput>);
export const active = (c: RouteContext) => getService().active(user(c));
export const decide = (c: RouteContext) =>
  getService().decide(user(c), c.params.id!, (c.body as z.infer<typeof decideInput>).decision);
export const auditLog = (c: RouteContext) => getService().auditLog(user(c));
