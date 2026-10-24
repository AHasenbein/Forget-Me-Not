import { describe, expect, it, vi } from 'vitest';
import { createVerifier, type AuthPorts } from './supabase-verifier';

const ports = (over: Partial<AuthPorts> = {}): AuthPorts => ({
  userIdForToken: async (t) => (t === 'good' ? 'u1' : null),
  profileFor: async () => ({ role: 'primary_caregiver', patient_id: 'p1', grants: [] }),
  ...over,
});

describe('live verifier', () => {
  it('maps a valid token + profile to an AuthUser', async () => {
    expect(await createVerifier(ports()).verify('good')).toEqual({
      id: 'u1',
      role: 'primary_caregiver',
      patientId: 'p1',
      grants: [],
    });
  });
  it('rejects bad tokens, empty tokens and absurdly long tokens without asking the database', async () => {
    const profileFor = vi.fn();
    const v = createVerifier(ports({ profileFor }));
    expect(await v.verify('nope')).toBeNull();
    expect(await v.verify('')).toBeNull();
    expect(await v.verify('x'.repeat(5000))).toBeNull();
    expect(profileFor).not.toHaveBeenCalled();
  });
  it('a signed-in user with NO profile gets nothing (open signups cannot reach data)', async () => {
    expect(await createVerifier(ports({ profileFor: async () => null })).verify('good')).toBeNull();
  });
  it('rejects an unknown role instead of guessing', async () => {
    const v = createVerifier(
      ports({ profileFor: async () => ({ role: 'admin', patient_id: 'p1', grants: [] }) }),
    );
    expect(await v.verify('good')).toBeNull();
  });
  it('only circle members carry grants, and unknown grants are dropped', async () => {
    const member = createVerifier(
      ports({
        profileFor: async () => ({
          role: 'circle_member',
          patient_id: 'p1',
          grants: ['view_location', 'root', 7],
        }),
      }),
    );
    expect((await member.verify('good'))?.grants).toEqual(['view_location']);
    const caregiver = createVerifier(
      ports({
        profileFor: async () => ({
          role: 'primary_caregiver',
          patient_id: 'p1',
          grants: ['view_location'],
        }),
      }),
    );
    expect((await caregiver.verify('good'))?.grants).toEqual([]);
  });
  it('never throws: a database error is "not signed in", and is not cached', async () => {
    let fail = true;
    const v = createVerifier(
      ports({
        profileFor: async () => {
          if (fail) throw new Error('db down');
          return { role: 'patient', patient_id: 'u1', grants: [] };
        },
      }),
    );
    expect(await v.verify('good')).toBeNull();
    fail = false;
    expect((await v.verify('good'))?.role).toBe('patient'); // recovered immediately
  });
  it('caches briefly, then asks again', async () => {
    let t = 0;
    const userIdForToken = vi.fn(async () => 'u1');
    const v = createVerifier(ports({ userIdForToken }), { ttlMs: 1000, now: () => t });
    await v.verify('good');
    await v.verify('good');
    expect(userIdForToken).toHaveBeenCalledTimes(1);
    t = 1500;
    await v.verify('good');
    expect(userIdForToken).toHaveBeenCalledTimes(2);
  });
});
