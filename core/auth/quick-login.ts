import { Hono } from 'hono';

/**
 * DEV CONVENIENCE: sign in as one of the four seeded test accounts without typing a password.
 * The server holds the password and hands back only a session; nothing secret reaches the app bundle.
 * It is OFF unless QUICK_LOGIN=on, never active in production or demo mode, and the dev API only listens on
 * localhost in live mode. NEVER enable it on a deployed server: anyone who can reach it could sign in.
 */
export const QUICK_ACCOUNTS = {
  caregiver: 'casey.caregiver@example.com',
  patient: 'margaret.patient@example.com',
  daughter: 'dana.daughter@example.com',
  friend: 'fred.friend@example.com',
} as const;
export type QuickAccount = keyof typeof QUICK_ACCOUNTS;

export interface QuickSession {
  access_token: string;
  refresh_token: string;
}

export function createQuickLogin(deps: {
  enabled: boolean;
  password: string;
  signIn(email: string, password: string): Promise<QuickSession | null>;
}) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (!deps.enabled) return c.json({ error: 'not_found' }, 404); // looks like it does not exist
    await next();
  });
  app.post('/quick-login', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { account?: unknown };
    const account = body.account;
    if (typeof account !== 'string' || !Object.hasOwn(QUICK_ACCOUNTS, account))
      return c.json({ error: 'invalid_input' }, 400);
    const session = await deps
      .signIn(QUICK_ACCOUNTS[account as QuickAccount], deps.password)
      .catch(() => null);
    if (!session) return c.json({ error: 'sign_in_failed' }, 401);
    return c.json({ access_token: session.access_token, refresh_token: session.refresh_token });
  });
  return app;
}
