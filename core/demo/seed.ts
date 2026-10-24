import { isDemo } from '../config/data-mode';
import { EventBus } from '../events/bus';
import { isEnabled } from '../feature-registry/flags';
import type { FeatureManifest } from '../feature-registry/manifest';
import type { DemoWorld } from './world';

/**
 * Runs each ENABLED feature's `demoSeed` against the shared demo world. Refuses outside demo mode:
 * canned data must never be written into a live database.
 */
export async function seedDemo(
  manifests: readonly FeatureManifest[],
  deps: { world: DemoWorld; bus?: EventBus; env?: Record<string, string | undefined> },
): Promise<string[]> {
  if (!isDemo('data', deps.env as never))
    throw new Error('seedDemo refused: DATA_MODE is not "demo"');
  const seeded: string[] = [];
  for (const m of manifests) {
    if (!m.demoSeed || !isEnabled(m, deps.env)) continue;
    await m.demoSeed({ world: deps.world, bus: deps.bus ?? new EventBus() });
    seeded.push(m.name);
  }
  return seeded;
}
