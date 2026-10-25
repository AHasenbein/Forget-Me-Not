import { describe, expect, it } from 'vitest';
import { profileAccess } from '../../server/access';

type Profile = { role: unknown; patient_id: unknown; grants: unknown };
const rows: Record<string, Profile> = {
  carol: { role: 'primary_caregiver', patient_id: 'p1', grants: [] },
  dana: { role: 'circle_member', patient_id: 'p1', grants: ['view_location'] },
  fred: { role: 'circle_member', patient_id: 'p1', grants: ['send_checkins'] },
  p1: { role: 'patient', patient_id: 'p1', grants: [] },
  p2: { role: 'patient', patient_id: 'p2', grants: [] },
  other: { role: 'primary_caregiver', patient_id: 'p2', grants: [] },
  odd: { role: 'circle_member', patient_id: 'p1', grants: 'view_location' }, // malformed grants
};
const check = profileAccess(async (id) => rows[id] ?? null);

describe('live contract access (profiles row of the requester)', () => {
  it.each([
    ['carol', 'p1', true, 'primary caregiver of this patient'],
    ['dana', 'p1', true, 'circle member with view_location'],
    ['fred', 'p1', false, 'circle member without the grant'],
    ['p1', 'p1', true, 'the patient themself'],
    ['p2', 'p1', false, 'another patient'],
    ['other', 'p1', false, "another patient's caregiver"],
    ['nobody', 'p1', false, 'no profile row (open signups)'],
    ['odd', 'p1', false, 'malformed grants'],
  ])('%s -> %s: %s (%s)', async (who, patient, expected) => {
    expect(await check(who, patient)).toBe(expected);
  });

  it('a failed lookup denies (fail closed)', async () => {
    const broken = profileAccess(async () => {
      throw new Error('db down');
    });
    expect(await broken('carol', 'p1')).toBe(false);
  });
});
