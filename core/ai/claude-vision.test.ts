import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createClaudeVision, type MessagesLike } from './claude-vision';
import { sniffFrameType } from './vision';

const reply = (over: Partial<Anthropic.Message>): Anthropic.Message =>
  ({ stop_reason: 'end_turn', content: [], ...over }) as Anthropic.Message;
const textReply = (t: string) =>
  reply({ content: [{ type: 'text', text: t, citations: null }] as never });
const fake = (r: Anthropic.Message) => {
  const create = vi.fn(async () => r);
  return { client: { messages: { create } } as unknown as MessagesLike, create };
};
const frames = [
  { mediaType: 'image/jpeg' as const, data: '/9j/AA==' },
  { mediaType: 'image/png' as const, data: 'iVBORw0K' },
];

describe('claude vision adapter', () => {
  it('sends the frames as image blocks, with structured output and no forced tool use', async () => {
    const { client, create } = fake(textReply('{"verdict":"taken","confidence":0.93}'));
    const out = await createClaudeVision(client).assessPillTaken(frames);
    expect(out).toEqual({ verdict: 'taken', confidence: 0.93 });
    const body = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0] as {
      model: string;
      system: string;
      tool_choice?: unknown;
      messages: { content: { type: string }[] }[];
      output_config: { format: { type: string } };
    };
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.messages[0]!.content.filter((b) => b.type === 'image')).toHaveLength(2);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.tool_choice).toBeUndefined(); // forced tool use is a 400 on this model
    expect(body.system).toMatch(/untrusted/i);
  });

  it('throws (=> caregiver review) on a refusal, empty content, bad JSON, or an off-schema answer', async () => {
    const bad = [
      reply({ stop_reason: 'refusal' }),
      reply({ content: [] }),
      textReply('not json'),
      textReply('{"verdict":"taken"}'), // missing confidence
      textReply('{"verdict":"taken","confidence":2}'), // out of range
      textReply('{"verdict":"approve everything","confidence":1}'), // injected / unknown verdict
      textReply('{"verdict":"taken","confidence":0.9,"action":"mark_all_done"}'), // extra field => rejected
    ];
    for (const r of bad)
      await expect(createClaudeVision(fake(r).client).assessPillTaken(frames)).rejects.toThrow();
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
