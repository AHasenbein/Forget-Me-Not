import { envKey } from '../config/env';
import type { FeatureManifest } from './manifest';

/** Flag resolution: FEATURE_<NAME>=on|off, else FEATURE_ALL, else the manifest default. Safe on mobile and server. */
export function isEnabled(
  m: Pick<FeatureManifest, 'name' | 'enabledByDefault'>,
  source: Record<string, string | undefined> = process.env,
): boolean {
  const v = source[`FEATURE_${envKey(m.name)}`] ?? source.FEATURE_ALL; // FEATURE_ALL=on: demo convenience
  return v === 'on' ? true : v === 'off' ? false : m.enabledByDefault;
}
