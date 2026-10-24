import { CIRCLE_FORBIDDEN_ACTIONS, type CirclePermission, type Role } from '@contracts/circle';
import type { AuthUser } from './types';

export function hasRole(user: AuthUser, roles: readonly Role[]): boolean {
  return roles.includes(user.role);
}

/** Deny by default: only circle members with an explicit grant pass. */
export function hasCirclePermission(user: AuthUser, perm: CirclePermission): boolean {
  return user.role === 'circle_member' && user.grants.includes(perm);
}

/** Circle members can never approve purchases or change settings, whatever they are granted. */
export function isForbiddenForCircle(user: AuthUser, action: string): boolean {
  return (
    user.role === 'circle_member' &&
    (CIRCLE_FORBIDDEN_ACTIONS as readonly string[]).includes(action)
  );
}
