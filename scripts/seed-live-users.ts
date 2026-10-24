/**
 * Creates the four fictional test accounts in YOUR Supabase project and links them to one patient:
 * patient, primary caregiver, daughter (location grant), friend (check-ins only). Idempotent.
 * Run after `npm run db:push`:  npm run seed:live      (needs SEED_PASSWORD in .env, >= 12 chars)
 * Passwords are never printed or stored anywhere but your .env. Emails are fictional (@example.com).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
if (!url || !key) throw new Error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
if (!password || password.length < 12)
  throw new Error('Set SEED_PASSWORD (at least 12 characters) in .env');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const ACCOUNTS = [
  { email: 'margaret.patient@example.com', role: 'patient', grants: [] },
  { email: 'casey.caregiver@example.com', role: 'primary_caregiver', grants: [] },
  {
    email: 'dana.daughter@example.com',
    role: 'circle_member',
    grants: ['receive_checkins', 'send_checkins', 'view_location', 'receive_safezone_alerts'],
  },
  {
    email: 'fred.friend@example.com',
    role: 'circle_member',
    grants: ['receive_checkins', 'send_checkins'],
  },
] as const;

async function ensureUser(email: string): Promise<string> {
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) return created.data.user.id;
  // Already exists: find it, and reset the password to the one in .env so sign-in matches.
  const list = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list.data.users.find((u) => u.email === email);
  if (!found) throw new Error(`Could not create or find ${email}: ${created.error?.message}`);
  await db.auth.admin.updateUserById(found.id, { password, email_confirm: true });
  return found.id;
}

const ids: Record<string, string> = {};
for (const a of ACCOUNTS) ids[a.email] = await ensureUser(a.email);
const patientId = ids['margaret.patient@example.com']!;

for (const a of ACCOUNTS) {
  const { error } = await db
    .from('profiles')
    .upsert({ user_id: ids[a.email], role: a.role, patient_id: patientId, grants: a.grants });
  if (error) throw new Error(`profiles: ${error.message} (did you run npm run db:push?)`);
  console.log(`ok  ${a.role.padEnd(18)} ${a.email}`);
}
console.log('Sign in with any of these emails and SEED_PASSWORD from your .env.');
