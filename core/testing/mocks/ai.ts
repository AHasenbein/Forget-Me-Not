import type { AiClient, AiResult } from '../../ai/client';

export function createMockAi(result: Partial<AiResult> = {}): AiClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async complete(input) {
      calls.push(input);
      return { text: 'mock summary', confidence: 0.95, ...result };
    },
  };
}
