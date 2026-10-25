import type { AuthUser } from '@core/auth/types';
import type { RouteContext } from '@core/feature-registry/manifest';
import { getService } from './runtime';
import type { ScanInput } from './schemas';

// access (in the manifest) guarantees a user on every route here; the service re-checks role + patient scope.
const user = (c: RouteContext) => c.user as AuthUser;

export const scan = (c: RouteContext) => getService().scan(user(c), (c.body as ScanInput).frames);
export const list = (c: RouteContext) => getService().list(user(c));
