import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetClock, setSpeed } from '@core/clock';
import { REPORT_INTERVAL_MS } from '../../constants';
import manifest from '../../manifest';
import { getRuntime, resetRuntime } from '../../server/runtime';
import { createTracker } from '../../tracker/tracker';
import type { Reading } from '../../tracker/types';

// expo-location / TaskManager / AsyncStorage are native: replaced by small fakes so the wiring itself is tested.
const loc = vi.hoisted(() => ({
  fg: 'granted',
  bg: 'granted',
  current: null as null | (() => Promise<unknown>),
  watchers: [] as ((l: unknown) => void)[],
  removed: 0,
  started: false,
  startCalls: 0,
}));
vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: async () => ({ status: loc.fg }),
  requestBackgroundPermissionsAsync: async () => ({ status: loc.bg }),
  getCurrentPositionAsync: () => loc.current!(),
  watchPositionAsync: async (_o: unknown, cb: (l: unknown) => void) => {
    loc.watchers.push(cb);
    return { remove: () => void loc.removed++ };
  },
  hasStartedLocationUpdatesAsync: async () => loc.started,
  startLocationUpdatesAsync: async () => {
    loc.started = true;
    loc.startCalls++;
  },
  stopLocationUpdatesAsync: async () => void (loc.started = false),
}));
vi.mock('expo-task-manager', () => ({ defineTask: () => undefined }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));

const T0 = Date.parse('2026-01-01T12:00:00Z');
const osFix = (ms: number) => ({
  coords: { latitude: 40.7, longitude: -74, accuracy: 12 },
  timestamp: ms,
  mocked: false,
});
const recording = () => {
  const sent: Reading[] = [];
  const tracker = createTracker({
    uploader: { send: async (b) => (sent.push(...b), 'ok') },
    storage: { load: async () => [], save: async () => undefined },
    now: () => new Date(T0 + 60 * 60_000),
  });
  return { sent, tracker };
};

beforeEach(() => {
  Object.assign(loc, {
    fg: 'granted',
    bg: 'granted',
    current: async () => osFix(T0),
    watchers: [],
    removed: 0,
    started: false,
    startCalls: 0,
  });
});

describe('native tracker wiring (expo.ts)', () => {
  it('"When in use": keeps reporting while the app is open, not just the first fix', async () => {
    loc.bg = 'denied';
    const { startTracking } = await import('../../tracker/expo');
    const { sent, tracker } = recording();
    const session = await startTracking(tracker);
    expect(session.level).toBe('when_in_use');
    expect(loc.startCalls).toBe(0);
    expect(loc.watchers).toHaveLength(1);
    loc.watchers[0]!(osFix(T0 + REPORT_INTERVAL_MS));
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    session.stop();
    expect(loc.removed).toBe(1);
  });

  it('"Always": starts the background task once, no foreground watcher', async () => {
    const { startTracking } = await import('../../tracker/expo');
    const { sent, tracker } = recording();
    expect((await startTracking(tracker)).level).toBe('always');
    await startTracking(tracker); // remount: never a second task
    expect(loc.startCalls).toBe(1);
    expect(loc.watchers).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it('a failed first fix (GPS off, timeout) still starts tracking', async () => {
    loc.current = async () => {
      throw new Error('timeout');
    };
    const { startTracking } = await import('../../tracker/expo');
    const { sent, tracker } = recording();
    expect((await startTracking(tracker)).level).toBe('always');
    expect(loc.startCalls).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it('denied: nothing starts', async () => {
    loc.fg = 'denied';
    const { startTracking } = await import('../../tracker/expo');
    const { tracker } = recording();
    expect((await startTracking(tracker)).level).toBe('denied');
    expect(loc.startCalls + loc.watchers.length).toBe(0);
  });
});

describe('web refresh (web.ts)', () => {
  const geo = { getCurrentPosition: vi.fn() };
  beforeEach(() => {
    geo.getCurrentPosition.mockReset();
    vi.stubGlobal('navigator', { geolocation: geo });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a fresh fix, so a patient sitting still is not shown as "old"', async () => {
    const { refreshWebPosition } = await import('../../tracker/web');
    const { sent, tracker } = recording();
    let t = T0;
    geo.getCurrentPosition.mockImplementation((ok: (p: unknown) => void) =>
      ok(osFix((t += REPORT_INTERVAL_MS))),
    );
    await refreshWebPosition(tracker);
    await refreshWebPosition(tracker);
    expect(sent).toHaveLength(2);
    expect(geo.getCurrentPosition.mock.calls[0]![2]).toMatchObject({ maximumAge: 0 });
  });

  it('a failed lookup resolves quietly (the watcher reports the state)', async () => {
    const { refreshWebPosition } = await import('../../tracker/web');
    const { sent, tracker } = recording();
    geo.getCurrentPosition.mockImplementation((_ok: unknown, fail: (e: unknown) => void) =>
      fail({ code: 2 }),
    );
    await refreshWebPosition(tracker);
    expect(sent).toHaveLength(0);
  });

  it('no geolocation at all: resolves without throwing', async () => {
    vi.stubGlobal('navigator', {});
    const { refreshWebPosition } = await import('../../tracker/web');
    await expect(refreshWebPosition(recording().tracker)).resolves.toBeUndefined();
  });
});

describe('server time and demo reset', () => {
  afterEach(() => resetClock());
  const patient = { id: 'p', role: 'patient' as const, patientId: 'p', grants: [] };
  const caregiver = { id: 'c', role: 'primary_caregiver' as const, patientId: 'p', grants: [] };
  const fresh = () => ({
    lat: 40.7,
    lng: -74,
    accuracyM: 10,
    recordedAt: new Date().toISOString(), // device readings carry real device time
    source: 'gps' as const,
  });

  // A sped-up demo clock (60x for reminder escalations) must not make a fresh reading look old or end Find at once.
  it('a fresh device reading is not "old" and Find keeps running while the demo clock is sped up', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(T0);
      resetClock();
      const { service } = resetRuntime();
      setSpeed(60);
      vi.advanceTimersByTime(20_000); // 20 real seconds = 20 demo minutes
      service.ingest(patient, [fresh()]);
      service.startFind(caregiver);
      vi.advanceTimersByTime(20_000);
      expect(service.view(caregiver).location?.stale).toBe(false);
      expect(service.findStatus(caregiver).active).toBe(true);
    } finally {
      resetClock();
      vi.useRealTimers();
    }
  });

  it('demoReset forgets device readings and find sessions', async () => {
    const { service } = resetRuntime();
    service.ingest(patient, [fresh()]);
    service.startFind(caregiver);
    await manifest.demoReset!();
    expect(getRuntime().store.getLatest('p')).toBeNull();
    expect(getRuntime().service.findStatus(caregiver).active).toBe(false);
  });
});
