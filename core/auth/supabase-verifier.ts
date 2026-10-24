import type { SupabaseClient } from '@supabase/supabase-js';
import { CIRCLE_PERMISSIONS, ROLES, type CirclePermission, type Role } from '@contracts/circle';
import { logger } from '../logging/logger';
import type { AuthUser, TokenVerifier } from './types';

export interface AuthPorts {
  /** Validates the access token with Supabase Auth and returns the user id, or null. */
  userIdForToken(token: string): Promise<string | null>;
  /** Reads OUR profiles table (never auth metadata). */
  profileFor(
    userId: string,
  ): Promise<{ role: unknown; patient_id: unknown; grants: unknown } | null>;
}

/**
 * Live token verifier. Never throws (a bad token is just "not signed in"); a user with no valid profile
 * row gets null too, so open signups cannot reach any data. Results are cached briefly so polling screens
 * don't hit Supabase on every request; that means a revoked role/token can linger up to `ttlMs`.
 */
export function createVerifier(
  ports: AuthPorts,
  opts: { ttlMs?: number; now?: () => number } = {},
): TokenVerifier {
  const ttl = opts.ttlMs ?? 15_000;
  const clock = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; user: AuthUser | null }>();

  return {
    async verify(token: string): Promise<AuthUser | null> {
      if (!token || token.length > 4096) return null;
      const hit = cache.get(token);
      if (hit && clock() - hit.at < ttl) return hit.user;
      let user: AuthUser | null = null;
      try {
        const id = await ports.userIdForToken(token);
        const p = id ? await ports.profileFor(id) : null;
        if (id && p && (ROLES as readonly unknown[]).includes(p.role)) {
          const role = p.role as Role;
          const patientId = typeof p.patient_id === 'string' && p.patient_id ? p.patient_id : null;
          const grants = Array.isArray(p.grants)
            ? (p.grants.filter((g) =>
                (CIRCLE_PERMISSIONS as readonly unknown[]).includes(g),
              ) as CirclePermission[])
            : [];
          user = { id, role, patientId, grants: role === 'circle_member' ? grants : [] };
        }
      } catch (err) {
        logger.error('auth verify failed', { err: String(err) }); // fail closed
        return null; // not cached: a transient error must not lock a user out for ttl
      }
      if (cache.size > 500) cache.clear();
      cache.set(token, { at: clock(), user });
      return user;
    },
  };
}

/** Adapter over the service-role client. */
export function supabaseAuthPorts(db: SupabaseClient): AuthPorts {
  return {
    async userIdForToken(token) {
      const { data, error } = await db.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async profileFor(userId) {
      const { data, error } = await db
        .from('profiles')
        .select('role, patient_id, grants')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  };
}
