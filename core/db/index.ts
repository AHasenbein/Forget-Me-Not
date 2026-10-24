import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the SERVICE ROLE key (bypasses RLS). Only the API process may hold it:
 * never import this from app/ or ui/ code, never put the key in an EXPO_PUBLIC_* variable.
 * Every table has RLS enabled with NO policies and no grants to anon/authenticated, so the anon key (which
 * ships in the app and the public repo) can read and write nothing. All access goes through the server,
 * which does its own role/patient checks.
 */
let client: SupabaseClient | undefined;

export function serviceClient(
  env: Record<string, string | undefined> = process.env,
): SupabaseClient {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in live mode');
  return (client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** Tests only. */
export const resetServiceClient = () => void (client = undefined);
