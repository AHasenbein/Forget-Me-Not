/** Roles and circle permissions. Shared vocabulary only; enforcement lives in core/auth. */
export const ROLES = ['patient', 'primary_caregiver', 'circle_member'] as const;
export type Role = (typeof ROLES)[number];

/** Per-member grants. Opt-in, revocable. Anything not granted is denied. */
export const CIRCLE_PERMISSIONS = [
  'view_location',
  'receive_checkins',
  'send_checkins',
  'receive_safezone_alerts',
] as const;
export type CirclePermission = (typeof CIRCLE_PERMISSIONS)[number];

/** Location visibility for one member: live, last-known only, or off. */
export type LocationVisibility = 'live' | 'last_known' | 'off';

/** Actions a circle member can NEVER perform, regardless of grants. */
export const CIRCLE_FORBIDDEN_ACTIONS = ['approve_purchase', 'change_settings'] as const;
