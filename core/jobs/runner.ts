import { now } from '../clock';
import { isEnabled } from '../feature-registry/flags';
import type { FeatureManifest } from '../feature-registry/manifest';
import { logger } from '../logging/logger';

/**
 * Runs each ENABLED feature's `jobs` in this process (dev API / a single server).
 * It polls the APP clock (core/clock) and runs a job once `everyMs` of app time has passed since its last
 * run, so speeding up or jumping demo time triggers jobs immediately (a timer scheduled before the change
 * would not notice). One run at a time per job: a slow run never overlaps itself, and a throwing job is
 * logged and retried on the next eligible poll.
 */
export function startJobs(
  manifests: readonly FeatureManifest[],
  opts: { env?: Record<string, string | undefined>; pollMs?: number } = {},
): () => void {
  const pollMs = opts.pollMs ?? 500;
  const timers: ReturnType<typeof setInterval>[] = [];

  for (const m of manifests) {
    if (!isEnabled(m, opts.env)) continue;
    for (const job of m.jobs ?? []) {
      let last = Number.NEGATIVE_INFINITY;
      let running = false;
      timers.push(
        setInterval(
          async () => {
            if (running || now().getTime() - last < job.everyMs) return;
            running = true;
            last = now().getTime();
            try {
              await job.run();
            } catch (err) {
              logger.error('job failed', { job: job.name, err: String(err) });
            } finally {
              running = false;
            }
          },
          Math.min(pollMs, job.everyMs),
        ),
      );
    }
  }
  return () => timers.forEach(clearInterval);
}
