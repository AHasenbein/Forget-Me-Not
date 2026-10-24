import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localDateOf, localTimeToUtc, weekdayOf } from '../../time';

const NY = 'America/New_York';

describe('time (happy path)', () => {
  it('converts a normal local time to UTC', () => {
    expect(localTimeToUtc('2026-06-01', '08:00', NY).toISOString()).toBe(
      '2026-06-01T12:00:00.000Z',
    );
    expect(localTimeToUtc('2026-01-15', '08:00', NY).toISOString()).toBe(
      '2026-01-15T13:00:00.000Z',
    );
  });
  it('knows the local date and weekday', () => {
    expect(localDateOf(new Date('2026-06-02T02:30:00Z'), NY)).toBe('2026-06-01'); // still evening in NY
    expect(weekdayOf('2026-06-01')).toBe(1); // Monday
  });
});

describe('time (edge cases: DST + zones)', () => {
  it('spring forward: a time that does not exist moves forward by the gap (02:30 -> 03:30 EDT)', () => {
    expect(localTimeToUtc('2026-03-08', '02:30', NY).toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });
  it('fall back: a time that occurs twice uses the FIRST occurrence (01:30 EDT)', () => {
    expect(localTimeToUtc('2026-11-01', '01:30', NY).toISOString()).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });
  it('the day of the change still yields one instant per local time', () => {
    expect(localTimeToUtc('2026-11-01', '08:00', NY).toISOString()).toBe(
      '2026-11-01T13:00:00.000Z',
    );
  });
  it('works for zones east of UTC and half-hour zones', () => {
    expect(localTimeToUtc('2026-06-01', '08:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-06-01T02:30:00.000Z',
    );
  });
  it('rejects unknown time zones', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone(NY)).toBe(true);
  });
});
