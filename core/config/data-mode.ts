/**
 * demo = canned, deterministic, fictional data + mock adapters (no keys, no real people contacted).
 * live = real adapters (Supabase data, real push/SMS, AI, Plaid sandbox).
 * Default: demo everywhere EXCEPT production. Demo in production needs ALLOW_DEMO_IN_PRODUCTION=true.
 * Per-service override: DATA_MODE_AI | DATA_MODE_VISION | DATA_MODE_DOCUMENTS | DATA_MODE_PLAID | DATA_MODE_NOTIFIER | DATA_MODE_LOCATION.
 * Mobile reads EXPO_PUBLIC_DATA_MODE (Expo inlines literal `process.env.EXPO_PUBLIC_*` at build time).
 */
export type DataMode = 'demo' | 'live';
export type Service = 'ai' | 'vision' | 'documents' | 'plaid' | 'notifier' | 'location' | 'data';

type Source = Record<string, string | undefined>;
const processSource = (): Source => ({
  NODE_ENV: process.env.NODE_ENV,
  DATA_MODE: process.env.DATA_MODE,
  EXPO_PUBLIC_DATA_MODE: process.env.EXPO_PUBLIC_DATA_MODE,
  ALLOW_DEMO_IN_PRODUCTION:
    process.env.ALLOW_DEMO_IN_PRODUCTION ?? process.env.EXPO_PUBLIC_ALLOW_DEMO_IN_PRODUCTION,
  DATA_MODE_AI: process.env.DATA_MODE_AI,
  DATA_MODE_VISION: process.env.DATA_MODE_VISION,
  DATA_MODE_DOCUMENTS: process.env.DATA_MODE_DOCUMENTS,
  DATA_MODE_PLAID: process.env.DATA_MODE_PLAID,
  DATA_MODE_NOTIFIER: process.env.DATA_MODE_NOTIFIER,
  DATA_MODE_LOCATION: process.env.DATA_MODE_LOCATION,
});

const parse = (v: string | undefined, name: string): DataMode | undefined => {
  if (v === undefined || v === '') return undefined;
  if (v === 'demo' || v === 'live') return v;
  throw new Error(`${name} must be "demo" or "live" (got "${v}")`);
};

export function dataMode(service: Service = 'data', source: Source = processSource()): DataMode {
  const production = source.NODE_ENV === 'production';
  const mode =
    (service !== 'data'
      ? parse(source[`DATA_MODE_${service.toUpperCase()}`], `DATA_MODE_${service.toUpperCase()}`)
      : undefined) ??
    parse(source.DATA_MODE ?? source.EXPO_PUBLIC_DATA_MODE, 'DATA_MODE') ??
    (production ? 'live' : 'demo');
  if (mode === 'demo' && production && source.ALLOW_DEMO_IN_PRODUCTION !== 'true')
    throw new Error('DATA_MODE=demo in production requires ALLOW_DEMO_IN_PRODUCTION=true');
  return mode;
}

export const isDemo = (service: Service = 'data', source?: Source) =>
  dataMode(service, source) === 'demo';
