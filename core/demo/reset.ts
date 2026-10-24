import { resetClock } from '../clock';
import { isDemo } from '../config/data-mode';
import { isEnabled } from '../feature-registry/flags';
import type { FeatureManifest } from '../feature-registry/manifest';
import { buildDemoWorld } from './world';
import { seedDemo } from './seed';

/** Back to the start of the demo: real-time clock, features' canned data wiped and re-seeded. */
export async function resetDemo(
  manifests: readonly FeatureManifest[],
  env?: Record<string, string | undefined>,
): Promise<string[]> {
  if (!isDemo('data', env as never)) throw new Error('resetDemo refused: DATA_MODE is not "demo"');
  resetClock();
  for (const m of manifests) if (isEnabled(m, env)) await m.demoReset?.();
  return seedDemo(manifests, { world: buildDemoWorld(), env });
}
