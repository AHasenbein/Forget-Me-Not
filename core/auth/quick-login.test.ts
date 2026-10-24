import { describe, expect, it, vi } from 'vitest';
import { createQuickLogin, QUICK_ACCOUNTS } from './quick-login';

const session = { access_token: 'a', refresh_token: 'r' };
const make = (over: Partial<Parameters<typeof createQuickLogin>[0]> = {}) => {
  const signIn = vi.fn(async () => session);
  const app = createQuickLogin({ enabled: true, password: 'super-secret-pw', signIn, ...over });
  const post = (b: unknown) =>
    app.request('/quick-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(b),
    });
  return { app, signIn, post };
};

describe('quick login (dev convenience)', () => {
  it('signs in as the chosen seeded account and returns only the session', async () => {
    const { post, signIn } = make();
    const res = await post({ account: 'caregiver' });
    expect(res.status).toBe(200);
    expect(signIn).toHaveBeenCalledWith(QUICK_ACCOUNTS.caregiver, 'super-secret-pw');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual(session);
    expect(text).not.toContain('super-secret-pw'); // the password never leaves the server
  });

  it('is invisible (404) unless enabled', async () => {
    const { post, signIn } = make({ enabled: false });
    expect((await post({ account: 'caregiver' })).status).toBe(404);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('only the four seeded accounts are allowed: no arbitrary emails, no prototype tricks', async () => {
    const { post, signIn } = make();
    for (const account of [
      'admin',
      'someone@example.com',
      '__proto__',
      'constructor',
      'toString',
      42,
      null,
      undefined,
    ])
      expect((await post({ account })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('a failed or throwing sign-in is a generic 401', async () => {
    expect((await make({ signIn: async () => null }).post({ account: 'patient' })).status).toBe(
      401,
    );
    const boom = make({
      signIn: async () => {
        throw new Error('db password=hunter2');
      },
    });
    const res = await boom.post({ account: 'patient' });
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('hunter2');
  });
});
