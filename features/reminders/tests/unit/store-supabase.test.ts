import { afterAll, describe } from 'vitest';
import { serviceClient } from '@core/db';
import { SupabaseStore } from '../../supabase-store';
import { storeContract, storeContractPillCheck } from './store-contract';

/**
 * Runs the SAME contract against a real Supabase project, only when asked:
 *   node --env-file=.env node_modules/vitest/vitest.mjs run features/reminders/tests/unit/store-supabase.test.ts
 * with REMINDERS_TEST_SUPABASE=1. CI never needs Supabase; test rows use the `ct-` prefix and are cleaned up.
 */
const enabled =
  process.env.REMINDERS_TEST_SUPABASE === '1' &&
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function clean() {
  const db = serviceClient();
  await db.from('reminders_occurrences').delete().like('patient_id', 'ct-%');
  await db.from('reminders_schedules').delete().like('patient_id', 'ct-%');
  await db.from('reminders_frames').delete().like('patient_id', 'ct-%');
  await db.from('reminders_audit').delete().like('patient_id', 'ct-%');
}

if (enabled) {
  afterAll(clean);
  storeContract('SupabaseStore (real project)', async () => {
    await clean();
    return new SupabaseStore(serviceClient());
  });
  storeContractPillCheck('SupabaseStore (real project)', async () => {
    await clean();
    return new SupabaseStore(serviceClient());
  });
} else {
  describe.skip('ReminderStore contract: SupabaseStore (set REMINDERS_TEST_SUPABASE=1 to run)', () => {});
}
