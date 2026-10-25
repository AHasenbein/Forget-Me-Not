import { describe, expect, it } from 'vitest';
import { createDemoAi } from './ai';
import { buildDemoWorld } from './world';

const ask = (transcript: string) =>
  createDemoAi(buildDemoWorld()).complete({
    task: 'scam_call_assess',
    content: `x\n<transcript>\n${transcript}\n</transcript>`,
  });

describe('demo AI', () => {
  it('calls an ordinary conversation not a scam', async () => {
    const r = await ask('Hi Mum, it is Sam. Dinner on Sunday? I will bring the dessert.');
    expect(JSON.parse(r.text).verdict).toBe('not_scam');
  });

  it('calls out gift cards and a Social Security number, and names what it saw', async () => {
    for (const t of ['Please buy gift cards', 'I need your social security number']) {
      const r = JSON.parse((await ask(t)).text);
      expect(r.verdict).toBe('scam');
      expect(r.summary).toMatch(/^Likely scam/);
    }
  });

  it('any other task still gets the canned summary', async () => {
    const world = buildDemoWorld();
    const r = await createDemoAi(world).complete({ task: 'other', content: 'x' });
    expect(r.text).toBe(world.scamCall.summary);
  });
});
