import type { CirclePermission, Role } from '@contracts/circle';

/** The authenticated caller, as produced by a TokenVerifier (Supabase JWT in production). */
export interface AuthUser {
  id: string;
  role: Role;
  /** Patient this user is linked to (caregiver/circle member); null for unlinked users. */
  patientId: string | null;
  /** Only meaningful for circle_member. Empty = nothing granted. */
  grants: readonly CirclePermission[];
}

export interface TokenVerifier {
  /** Returns null for missing/invalid/expired tokens. Must never throw on bad input. */
  verify(bearerToken: string): Promise<AuthUser | null>;
}
