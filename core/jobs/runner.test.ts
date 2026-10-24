import { afterEach, describe, expect, it, vi } from 'vitest';
import { jump, resetClock } from '../clock';
import { defineFeature } from '../feature-registry/manifest';
import { startJobs } from './runner';

const feat = (name: string, enabledByDefault: boolean, run: () => Promise<void> | void) =>
  defineFeature({
    name,
    enabledByDefault,
    routes: [],
    nav: [],
    permissions: [],
    events: { emits: [], consumes: [] },
    migrations: [],
    jobs: [{ name: `${name}.tick`, everyMs: 1000, run }],
  });

describe('jobs runner', () => {
  it('runs immediately when demo time jumps past the interval (not after the old timer)', async () => {
    vi.useFakeTimers();
    resetClock();
    const run = vi.fn();
    const stop = startJobs([feat('jumpy', true, run)], { env: {}, pollMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    expect(run).toHaveBeenCalledTimes(1);
    jump(60 * 60_000); // one virtual hour, zero real time
    await vi.advanceTimersByTimeAsync(150);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  afterEach(() => {
    resetClock();
    vi.useRealTimers();
  });

  it('runs enabled features repeatedly and never disabled ones', async () => {
    vi.useFakeTimers();
    const on = vi.fn();
    const off = vi.fn();
    const stop = startJobs([feat('on', true, on), feat('off', false, off)], { env: {} });
    await vi.advanceTimersByTimeAsync(3600);
    expect(on.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(off).not.toHaveBeenCalled();
    stop();
    const n = on.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(on).toHaveBeenCalledTimes(n);
  });

  it('never overlaps a slow run, and survives a throwing job', async () => {
    vi.useFakeTimers();
    let running = 0;
    let maxRunning = 0;
    let calls = 0;
    const slow = async () => {
      calls++;
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 3000));
      running--;
      if (calls === 1) throw new Error('boom');
    };
    const stop = startJobs([feat('slow', true, slow)], { env: {} });
    await vi.advanceTimersByTimeAsync(12_000);
    stop();
    expect(maxRunning).toBe(1);
    expect(calls).toBeGreaterThan(1); // kept going after the throw
  });
});
