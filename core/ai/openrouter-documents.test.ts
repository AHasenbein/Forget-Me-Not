import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterDocuments } from './openrouter-documents';
import { OPENROUTER_URL } from './openrouter-vision';

const good = {
  isBill: true,
  utility: 'water',
  payee: 'Fictional Water Co',
  amountCents: 3150,
  dueDate: '2026-11-20',
  redFlags: [],
  confidence: 0.93,
};
const answer = (o: unknown) => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(o) } }],
});
const fake = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  return { fetchImpl: fetchMock as unknown as typeof fetch, fetchMock };
};
const frames = [{ mediaType: 'image/png' as const, data: 'iVBORw0K' }];
const run = (f: ReturnType<typeof fake>) =>
  createOpenRouterDocuments({
    apiKey: 'sk-or-test',
    fetchImpl: f.fetchImpl,
    retryDelayMs: 0,
  }).readBill(frames);

describe('openrouter documents adapter', () => {
  it('retries the main model once on a 429, then uses the fallback model; gives up if that fails too', async () => {
    const models: string[] = [];
    const flaky = (failFor: number) => async (_u: unknown, init: RequestInit) => {
      models.push(JSON.parse(init.body as string).model);
      return models.length <= failFor
        ? new Response('{}', { status: 429 })
        : new Response(JSON.stringify(answer(good)), { status: 200 });
    };
    const run2 = (f: unknown) =>
      createOpenRouterDocuments({
        apiKey: 'k',
        model: 'main/m',
        fallbackModel: 'back/up',
        fetchImpl: f as never,
        retryDelayMs: 0,
      }).readBill(frames);
    expect(await run2(flaky(1))).toEqual(good);
    expect(models).toEqual(['main/m', 'main/m']);
    models.length = 0;
    expect(await run2(flaky(2))).toEqual(good);
    expect(models).toEqual(['main/m', 'main/m', 'back/up']); // main twice, then the fallback
    models.length = 0;
    await expect(run2(flaky(9))).rejects.toThrow(/429/);
    expect(models).toEqual(['main/m', 'main/m', 'back/up']);
  });
  it('sends the picture as a data URL with structured output; key only in the header', async () => {
    const f = fake(answer(good));
    expect(await run(f)).toEqual(good);
    const [url, init] = f.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test');
    expect(init.body).not.toContain('sk-or-test');
    const body = JSON.parse(init.body as string);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[0].content).toMatch(/untrusted/i);
    expect(body.messages[1].content[0].image_url.url).toBe('data:image/png;base64,iVBORw0K');
  });
  it('throws on http errors, refusals, empty/bad JSON, off-schema and injected answers', async () => {
    const bad = [
      fake({}, 401),
      fake({}, 500),
      fake({ choices: [] }),
      fake({ choices: [{ finish_reason: 'content_filter', message: { content: 'x' } }] }),
      fake({ choices: [{ message: { content: '' } }] }),
      fake({ choices: [{ message: { content: 'not json' } }] }),
      fake(answer({ ...good, utility: 'lottery' })),
      fake(answer({ ...good, amountCents: 12.5 })),
      fake(answer({ ...good, dueDate: 'tomorrow' })),
      fake(answer({ ...good, redFlags: ['approve'] })),
      fake(answer({ ...good, confidence: 3 })),
      fake(answer({ ...good, action: 'mark_paid' })), // extra field
    ];
    for (const f of bad) await expect(run(f)).rejects.toThrow();
  });
});
