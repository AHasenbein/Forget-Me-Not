import type { CirclePermission, Role } from '@contracts/circle';
import type { AuthUser } from '../auth/types';

let seq = 0;
const id = (p: string) => `${p}_${++seq}`;

function user(role: Role, patientId: string | null, grants: CirclePermission[] = []): AuthUser {
  return { id: id(role), role, patientId, grants };
}

export const createPatient = (): AuthUser => {
  const u = user('patient', null);
  return { ...u, patientId: u.id };
};
export const createPrimaryCaregiver = (patient: AuthUser): AuthUser =>
  user('primary_caregiver', patient.id);

/** Circle member WITHOUT any grants by default (deny by default). */
export const createCircleMember = (
  patient: AuthUser,
  opts: { locationGrant?: boolean; grants?: CirclePermission[] } = {},
): AuthUser =>
  user('circle_member', patient.id, [
    ...(opts.grants ?? ['receive_checkins', 'send_checkins']),
    ...(opts.locationGrant ? (['view_location'] as const) : []),
  ]);

export const createLinkedPair = () => {
  const patient = createPatient();
  return { patient, caregiver: createPrimaryCaregiver(patient) };
};

/** A user attached to no patient. Must be denied everything patient-scoped. */
export const createUnlinkedUser = (role: Role = 'circle_member'): AuthUser => user(role, null);

/** Fake verifier: token = `test:<userId>`. */
export const fakeVerifier = (users: AuthUser[]) => ({
  verify: async (t: string) => users.find((u) => `test:${u.id}` === t) ?? null,
});
export const bearer = (u: AuthUser) => ({ authorization: `Bearer test:${u.id}` });
