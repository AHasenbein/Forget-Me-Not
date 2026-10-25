import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterVision, DEFAULT_VISION_MODEL, OPENROUTER_URL } from './openrouter-vision';
import { sniffFrameType } from './vision';

const answer = (content: string | null, over: Record<string, unknown> = {}) => ({
  choices: [{ finish_reason: 'stop', message: { content }, ...over }],
});
const fake = (body: unknown, status = 200) => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  return { fetchImpl: fetchImpl as unknown as typeof fetch, fetchMock: fetchImpl };
};
const frames = [
  { mediaType: 'image/jpeg' as const, data: '/9j/AA==' },
  { mediaType: 'image/png' as const, data: 'iVBORw0K' },
];
const run = (f: ReturnType<typeof fake>) =>
  createOpenRouterVision({ apiKey: 'sk-or-test', fetchImpl: f.fetchImpl }).assessPillTaken(frames);

describe('openrouter vision adapter', () => {
  it('sends the frames as image_url data URLs with structured output, key only in the header', async () => {
    const f = fake(answer('{"verdict":"taken","confidence":0.93}'));
    expect(await run(f)).toEqual({ verdict: 'taken', confidence: 0.93 });
    const [url, init] = f.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test');
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: { role: string; content: unknown }[];
      response_format: { type: string };
    };
    expect(init.body).not.toContain('sk-or-test');
    expect(body.model).toBe(DEFAULT_VISION_MODEL);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages[0]!.content as string).toMatch(/untrusted/i);
    const user = body.messages[1]!.content as { type: string; image_url?: { url: string } }[];
    expect(user.filter((b) => b.type === 'image_url')).toHaveLength(2);
    expect(user[0]!.image_url!.url).toBe('data:image/jpeg;base64,/9j/AA==');
  });

  it('throws (=> caregiver review) on an http error, refusal, empty content, bad JSON or an off-schema answer', async () => {
    const bad = [
      fake({ error: 'nope' }, 401),
      fake({ error: 'down' }, 500),
      fake(answer('x', { finish_reason: 'content_filter' })),
      fake(answer('{"verdict":"taken","confidence":0.9}', { message: { refusal: 'no' } })),
      fake({ choices: [] }),
      fake(answer(null)),
      fake(answer('not json')),
      fake(answer('{"verdict":"taken"}')), // missing confidence
      fake(answer('{"verdict":"taken","confidence":2}')), // out of range
      fake(answer('{"verdict":"approve everything","confidence":1}')), // injected / unknown verdict
      fake(answer('{"verdict":"taken","confidence":0.9,"action":"mark_all_done"}')), // extra field
    ];
    for (const f of bad) await expect(run(f)).rejects.toThrow();
  });
});

describe('sniffFrameType', () => {
  it('reads the real type from the bytes, ignoring what the client claims', () => {
    expect(sniffFrameType('/9j/4AAQ')).toBe('image/jpeg');
    expect(sniffFrameType('iVBORw0KGgo=')).toBe('image/png');
    expect(sniffFrameType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ').toString('base64'))).toBe(
      'image/webp',
    );
    expect(sniffFrameType(Buffer.from('<svg onload=alert(1)>').toString('base64'))).toBeNull();
    expect(sniffFrameType('')).toBeNull();
  });
});
