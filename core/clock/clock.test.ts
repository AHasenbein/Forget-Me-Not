import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSpeed, jump, now, resetClock, setSpeed } from '.';

describe('app clock (demo mode, NODE_ENV=test)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    resetClock();
  });
  afterEach(() => {
    resetClock();
    vi.useRealTimers();
    delete process.env.DATA_MODE;
  });

  it('follows real time at 1x', () => {
    vi.advanceTimersByTime(60_000);
    expect(now().toISOString()).toBe('2026-06-01T12:01:00.000Z');
  });
  it('runs faster after setSpeed, without jumping at the change', () => {
    vi.advanceTimersByTime(60_000);
    setSpeed(60);
    expect(now().toISOString()).toBe('2026-06-01T12:01:00.000Z');
    vi.advanceTimersByTime(10_000); // 10 real seconds = 10 virtual minutes
    expect(now().toISOString()).toBe('2026-06-01T12:11:00.000Z');
  });
  it('jumps forward and resets', () => {
    jump(30 * 60_000);
    expect(now().toISOString()).toBe('2026-06-01T12:30:00.000Z');
    setSpeed(10);
    resetClock();
    expect(getSpeed()).toBe(1);
    expect(now().toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });
  it('validates input and refuses outside demo mode', () => {
    expect(() => setSpeed(0)).toThrow();
    expect(() => setSpeed(1e6)).toThrow();
    expect(() => jump(-1)).toThrow();
    process.env.DATA_MODE = 'live';
    expect(() => setSpeed(2)).toThrow(/demo mode/);
    expect(() => jump(1000)).toThrow(/demo mode/);
    vi.advanceTimersByTime(5000);
    expect(now().toISOString()).toBe('2026-06-01T12:00:05.000Z'); // live: always real time
  });
});
