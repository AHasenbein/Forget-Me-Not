import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser/phone Supabase client. It only ever holds the ANON key (public by design): it signs users in and
 * keeps their session. It cannot read or write any of our tables (RLS: no policies); data comes from our API.
 */
let client: SupabaseClient | undefined;

export function authClient(): SupabaseClient {
  // Literal process.env.EXPO_PUBLIC_* accesses so Expo can inline them.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon)
    throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set');
  return (client ??= createClient(url, anon, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }));
}
