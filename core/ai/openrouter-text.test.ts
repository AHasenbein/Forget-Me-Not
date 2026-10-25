import { describe, expect, it, vi } from 'vitest';
import { OPENROUTER_URL } from './openrouter-vision';
import { createOpenRouterText } from './openrouter-text';

const fake = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  return { fetchImpl: fetchMock as unknown as typeof fetch, fetchMock };
};
const run = (f: ReturnType<typeof fake>) =>
  createOpenRouterText({ apiKey: 'sk-or-test', fetchImpl: f.fetchImpl }).complete({
    task: 't',
    content: 'hello',
  });

describe('openrouter text adapter', () => {
  it('posts the content, key only in the header, and returns the text with confidence 1', async () => {
    const f = fake({ choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }] });
    expect(await run(f)).toEqual({ text: '{"a":1}', confidence: 1 });
    const [url, init] = f.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test');
    expect(init.body).not.toContain('sk-or-test');
    expect(JSON.parse(init.body as string).messages[1]).toEqual({ role: 'user', content: 'hello' });
  });
  it('throws on http errors, refusals, filters and empty answers (callers then use their rules)', async () => {
    const bad = [
      fake({}, 401),
      fake({}, 500),
      fake({ choices: [] }),
      fake({ choices: [{ finish_reason: 'content_filter', message: { content: 'x' } }] }),
      fake({ choices: [{ message: { refusal: 'no', content: 'x' } }] }),
      fake({ choices: [{ message: { content: '' } }] }),
    ];
    for (const f of bad) await expect(run(f)).rejects.toThrow();
  });
});
