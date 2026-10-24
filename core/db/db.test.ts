import { describe, expect, it } from 'vitest';
import { resetServiceClient, serviceClient } from '.';

describe('serviceClient', () => {
  it('refuses to build without both the URL and the service-role key', () => {
    resetServiceClient();
    expect(() => serviceClient({})).toThrow(/required in live mode/);
    expect(() => serviceClient({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow();
  });
});
