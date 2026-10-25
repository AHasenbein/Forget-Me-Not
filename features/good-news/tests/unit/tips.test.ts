import { describe, expect, it } from 'vitest';
import { FakeClock, createLinkedPair } from '@core/testing';
import { createGoodNewsService } from '../../service';
import { createCannedSource } from '../../sources';
import { MemoryMessageStore } from '../../store';
import { MONEY_TIPS, tipFor } from '../../tips';

describe('money tip of the day', () => {
  it('is the same all day and changes the next day, for every reader', () => {
    expect(tipFor('2026-10-25')).toBe(tipFor('2026-10-25'));
    expect(tipFor('2026-10-26')).not.toBe(tipFor('2026-10-25'));
    expect(MONEY_TIPS).toContain(tipFor('not-a-date')); // junk never crashes
  });

  it('every tip is short, plain and safety-focused (no investment advice)', () => {
    for (const t of MONEY_TIPS) {
      expect(t.length).toBeLessThanOrEqual(140);
      expect(t).not.toMatch(/\b(invest|stock|shares|crypto|bitcoin|return|interest rate)\b/i);
    }
  });

  it('the paper carries the tip of its edition date', async () => {
    const clock = new FakeClock('2026-10-25T09:00:00Z');
    const { patient } = createLinkedPair();
    const svc = createGoodNewsService({
      store: new MemoryMessageStore(),
      source: createCannedSource(() => []),
      fallback: null,
      now: clock.now,
    });
    const p = await svc.paper(patient);
    expect(p.tip).toBe(tipFor(p.date));
  });
});
