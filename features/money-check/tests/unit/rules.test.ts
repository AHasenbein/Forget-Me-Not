import { describe, expect, it } from 'vitest';
import { LARGE_AMOUNT_CENTS, assess, nextUnpaidBill } from '../../rules';

const bill = (id: string, amountCents: number, paid = false, dueDate?: string) => ({
  id,
  payee: 'Fictional Utility',
  amountCents,
  paid,
  dueDate,
});

describe('assess', () => {
  it('gift cards are always "stop"', () => {
    expect(assess('gift_card', [bill('b', 100)])).toMatchObject({
      level: 'stop',
      reasons: ['gift_card_payment'],
      bill: null,
    });
  });
  it('a caller asking for money is always "stop"', () => {
    expect(assess('caller_wants_money', []).level).toBe('stop');
  });
  it('a normal unpaid bill looks fine', () => {
    expect(assess('bill', [bill('b', 3150)])).toMatchObject({
      level: 'ok',
      reasons: ['known_bill'],
    });
  });
  it('a large bill needs a closer look', () => {
    const v = assess('bill', [bill('b', LARGE_AMOUNT_CENTS + 1)]);
    expect(v).toMatchObject({ level: 'check', reasons: ['large_amount'] });
    expect(assess('bill', [bill('b', LARGE_AMOUNT_CENTS)]).level).toBe('ok'); // boundary: not over
  });
  it('no unpaid bill (or only paid ones, or no bank data) is never "ok"', () => {
    expect(assess('bill', []).level).toBe('check');
    expect(assess('bill', [bill('b', 100, true)])).toMatchObject({
      level: 'check',
      reasons: ['no_matching_bill'],
    });
  });
  it('picks the earliest due unpaid bill, undated last', () => {
    const picked = nextUnpaidBill([
      bill('undated', 1),
      bill('later', 2, false, '2026-03-01'),
      bill('paid', 3, true, '2026-01-01'),
      bill('soon', 4, false, '2026-02-01'),
    ]);
    expect(picked?.id).toBe('soon');
  });
});
