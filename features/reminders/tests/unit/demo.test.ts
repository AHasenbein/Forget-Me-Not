import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetClock } from '@core/clock';
import { buildDemoWorld } from '@core/demo';
import { resetRuntime, getService, getStore } from '../../runtime';
import { seedReminders } from '../../demo';

describe('demo mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:30Z')); // the app clock follows system time in demo
    resetClock();
    resetRuntime();
  });
  afterEach(() => vi.useRealTimers());
  it('seeds Margaret’s four reminders idempotently and the caregiver sees them today', () => {
    const world = buildDemoWorld();
    seedReminders(world);
    seedReminders(world); // idempotent
    expect(getStore().listSchedules(world.patient.id)).toHaveLength(4);
    const today = getService().today(world.caregiver);
    expect(today.map((o) => o.kind).sort()).toEqual(['brush_teeth', 'feed_pets', 'pill', 'shower']);
    expect(today.every((o) => o.phase === 'upcoming')).toBe(true); // nothing already "missed"
    const later = getService().history(world.caregiver, 7);
    expect(later.summary).toEqual({ confirmed: 0, missed: 0, skipped: 0 });
  });
  it('seeds relative to now: the pill is due in 2 minutes, in the patient’s time zone', () => {
    const world = buildDemoWorld();
    seedReminders(world);
    const pill = getStore().getSchedule('demo-sched-demo-rem-1')!;
    expect(pill.localTime).toBe('08:02'); // 12:02Z = 08:02 EDT
  });
  it('refuses to run its memory store in live mode (fail loud, no silent data loss)', () => {
    const prev = process.env.DATA_MODE;
    process.env.DATA_MODE = 'live';
    try {
      expect(() => getStore()).toThrow(/no live store/);
    } finally {
      if (prev === undefined) delete process.env.DATA_MODE;
      else process.env.DATA_MODE = prev;
    }
  });
});
