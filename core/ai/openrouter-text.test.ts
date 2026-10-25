import { describe, expect, it } from 'vitest';
import { createOpenRouterText } from './openrouter-text';

const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const chat = (content: unknown, finish_reason = 'stop') => ({
  choices: [{ message: { content }, finish_reason }],
});
const ask = (f: typeof fetch) =>
  createOpenRouterText({ apiKey: 'k', fetch: f }).complete({ task: 't', content: 'c' });

describe('createOpenRouterText', () => {
  it('returns the text and a clamped confidence, and sends the key, model, task and content', async () => {
    let sent: { headers: Record<string, string>; body: string } | undefined;
    const f = (async (_u: string, init: { headers: Record<string, string>; body: string }) => {
      sent = init;
      return new Response(JSON.stringify(chat(JSON.stringify({ text: 'hello', confidence: 1.7 }))));
    }) as unknown as typeof fetch;
    expect(await ask(f)).toEqual({ text: 'hello', confidence: 1 });
    expect(sent!.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(sent!.body)).toMatchObject({ model: 'openai/gpt-4o-mini' });
    expect(sent!.body).toContain('Task: t');
  });

  it('accepts JSON wrapped in prose or a code fence', async () => {
    const r = await ask(reply(chat('```json\n{"text":"x","confidence":0.5}\n```')));
    expect(r).toEqual({ text: 'x', confidence: 0.5 });
  });

  it('keeps an answer given without the envelope, at a low confidence so it is flagged for review', async () => {
    const r = await ask(reply(chat('{"verdict":"scam","summary":"s"}')));
    expect(JSON.parse(r.text).verdict).toBe('scam');
    expect(r.confidence).toBeLessThan(0.7);
    const own = await ask(reply(chat('{"verdict":"scam","summary":"s","confidence":0.9}')));
    expect(own.confidence).toBe(0.9); // its own confidence is used when it gives one
  });

  it('throws (caller flags for review) on HTTP errors, empty, cut-off or malformed replies', async () => {
    await expect(ask(reply({}, 429))).rejects.toThrow('429');
    await expect(ask(reply(chat('')))).rejects.toThrow('no text');
    await expect(ask(reply({ choices: [] }))).rejects.toThrow('no text');
    await expect(ask(reply(chat('{"text":"x","confidence":1}', 'length')))).rejects.toThrow(
      'cut off',
    );
    await expect(ask(reply(chat('{"text":1}')))).rejects.toThrow('malformed');
    await expect(ask(reply(chat('nope')))).rejects.toThrow();
  });
});
