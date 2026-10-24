import { z } from 'zod';
import type { FeatureManifest } from '../feature-registry/manifest';

const coreSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLAID_ENV: z.literal('sandbox').default('sandbox'), // sandbox ONLY
  CALL_RECORDING_ENABLED: z.enum(['true', 'false']).default('false'),
});

export const envKey = (featureName: string) => featureName.toUpperCase().replace(/-/g, '_');

/**
 * Validates core env plus each ENABLED feature's own env schema (keys must be prefixed with the
 * feature name). Throws at startup with a list of problems. Disabled features are not validated.
 */
export function loadEnv(
  manifests: readonly FeatureManifest[],
  source: Record<string, string | undefined> = process.env,
) {
  const problems: string[] = [];
  const core = coreSchema.safeParse(source);
  if (!core.success)
    problems.push(...core.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const features: Record<string, unknown> = {};
  for (const m of manifests) {
    if (!m.env) continue;
    const prefix = `${envKey(m.name)}_`;
    const bad = Object.keys(m.env).filter((k) => !k.startsWith(prefix));
    if (bad.length)
      problems.push(`${m.name}: env keys must start with ${prefix} (${bad.join(', ')})`);
    const parsed = z.object(m.env).safeParse(source);
    if (parsed.success) features[m.name] = parsed.data;
    else
      problems.push(
        ...parsed.error.issues.map((i) => `${m.name}: ${i.path.join('.')}: ${i.message}`),
      );
  }
  if (problems.length) throw new Error(`Invalid environment:\n${problems.join('\n')}`);
  return { core: core.data as z.infer<typeof coreSchema>, features };
}
