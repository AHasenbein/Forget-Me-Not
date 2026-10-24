import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoWorld } from '@core/demo';
import { resetRuntime, getService, getStore } from '../../runtime';
import { seedReminders } from '../../demo';

describe('demo mode', () => {
  beforeEach(() => resetRuntime());
  it('seeds Margaret’s four reminders idempotently and the caregiver sees them today', () => {
    const world = buildDemoWorld(new Date('2026-06-01T12:00:00Z'));
    seedReminders(world);
    seedReminders(world); // idempotent
    expect(getStore().listSchedules(world.patient.id)).toHaveLength(4);
    const today = getService().today(world.caregiver);
    expect(today.map((o) => o.kind).sort()).toEqual(['brush_teeth', 'feed_pets', 'pill', 'shower']);
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
