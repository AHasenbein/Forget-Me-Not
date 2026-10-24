import type { VisionClient, VisionFrame, VisionResult } from '../../ai/vision';

/** Controllable vision: set `result` (or `error`) per test; `calls` records what it was shown. */
export function createMockVision(
  init: { result?: VisionResult; error?: Error } = {},
): VisionClient & { result: VisionResult; error: Error | undefined; calls: VisionFrame[][] } {
  const m = {
    result: init.result ?? ({ verdict: 'taken', confidence: 0.95 } as VisionResult),
    error: init.error,
    calls: [] as VisionFrame[][],
    async assessPillTaken(frames: readonly VisionFrame[]) {
      m.calls.push([...frames]);
      if (m.error) throw m.error;
      return m.result;
    },
  };
  return m;
}
