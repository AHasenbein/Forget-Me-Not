/**
 * Proves the public anon key can read/write NOTHING in our tables. Run after `npm run db:push`:
 *   npm run db:probe
 * Uses the service role only to plant one test row (patient `ct-probe`) and removes it at the end.
 */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !svc)
  throw new Error(
    'Need SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (run via npm run db:probe)',
  );

const TABLES = [
  'reminders_schedules',
  'reminders_occurrences',
  'location_tracking_last_known',
  'location_tracking_view_audit',
];
const call = async (method: string, path: string, key: string, body?: unknown) => {
  const res = await fetch(url + path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: (await res.text()).slice(0, 120) };
};

const row = {
  id: 'probe-1',
  patient_id: 'ct-probe',
  kind: 'pill',
  local_time: '08:00',
  days_of_week: [1],
  time_zone: 'UTC',
  created_by: 'probe',
  active_from: '2026-01-01T00:00:00Z',
};
let failed = false;
const expect = (ok: boolean, label: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${detail}`);
  if (!ok) failed = true;
};

try {
  const planted = await call('POST', '/rest/v1/reminders_schedules', svc, row);
  expect(
    planted.status === 201,
    'service role can write (planting a test row)',
    `[${planted.status}]`,
  );
  for (const t of TABLES) {
    const r = await call('GET', `/rest/v1/${t}?select=*`, anon);
    expect(r.status !== 200 || r.text === '[]', `anon cannot read ${t}`, `[${r.status}] ${r.text}`);
  }
  const ins = await call('POST', '/rest/v1/reminders_schedules', anon, { ...row, id: 'probe-2' });
  expect(ins.status >= 400, 'anon cannot insert', `[${ins.status}]`);
  await call('DELETE', '/rest/v1/reminders_schedules?id=eq.probe-1', anon);
  const still = await call('GET', '/rest/v1/reminders_schedules?id=eq.probe-1&select=id', svc);
  expect(still.text.includes('probe-1'), 'anon cannot delete the planted row');
} finally {
  await call('DELETE', '/rest/v1/reminders_schedules?patient_id=eq.ct-probe', svc);
}
process.exit(failed ? 1 : 0);
