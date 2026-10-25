import type { AuthPorts } from '@core/auth/supabase-verifier';
import type { AccessCheck } from './service';

/**
 * Live access for contract reads (lost-button, later friends-family): the requester's OWN profile row decides, read
 * fresh on every call so a revocation or unlinking applies at once. Same patient, and either the primary caregiver,
 * a circle member with `view_location`, or the patient themself. Any lookup trouble denies (fail closed).
 */
export function profileAccess(profileFor: AuthPorts['profileFor']): AccessCheck {
  return async (requesterId, patientId) => {
    try {
      const p = await profileFor(requesterId);
      if (!p || p.patient_id !== patientId) return false;
      if (p.role === 'primary_caregiver') return true;
      if (p.role === 'patient') return requesterId === patientId;
      return (
        p.role === 'circle_member' && Array.isArray(p.grants) && p.grants.includes('view_location')
      );
    } catch {
      return false;
    }
  };
}
