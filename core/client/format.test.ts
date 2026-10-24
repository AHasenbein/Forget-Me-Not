import { describe, expect, it } from 'vitest';
import { daysLabel, formatTime } from './format';

describe('format', () => {
  it('formats times in the given zone', () => {
    expect(formatTime('2026-06-01T12:02:00Z', 'America/New_York')).toBe('8:02 AM');
    expect(formatTime('2026-06-01T12:02:00Z', 'Asia/Kolkata')).toBe('5:32 PM');
  });
  it('falls back to the device zone for a bad zone instead of throwing', () => {
    expect(() => formatTime('2026-06-01T12:02:00Z', 'Nope/Nowhere')).not.toThrow();
  });
  it('labels days', () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(daysLabel([3, 1])).toBe('Mon, Wed');
  });
});
