import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FeatureManifest } from './manifest';

export const FEATURES_DIR = fileURLToPath(new URL('../../features', import.meta.url));

/** Folder names under features/ that are real features (skips `_template` and dotfolders). */
export function listFeatureDirs(dir = FEATURES_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}

/** Node-only (uses fs). Never import from mobile code. Node-side auto-discovery (API server, tests). Mobile uses registry.generated.ts instead. */
export async function discoverManifests(dir = FEATURES_DIR): Promise<FeatureManifest[]> {
  const out: FeatureManifest[] = [];
  for (const name of listFeatureDirs(dir)) {
    const file = join(dir, name, 'manifest.ts');
    if (!existsSync(file)) throw new Error(`features/${name} has no manifest.ts`);
    const mod = (await import(pathToFileURL(file).href)) as { default: FeatureManifest };
    if (mod.default.name !== name)
      throw new Error(`features/${name}: manifest.name must equal folder`);
    out.push(mod.default);
  }
  return out;
}

export { isEnabled } from './flags';
