import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { REPORT_INTERVAL_MS } from '../constants';
import { createHttpUploader, type HttpUploaderDeps } from './http';
import { createTracker, type Tracker } from './tracker';
import type { Fix, QueueStorage } from './types';

/**
 * Device wiring (needs a dev build; Expo Go cannot run background location). Thin on purpose: all decisions live in
 * tracker.ts, which is unit-tested. NOT yet exercised on a real device: verify per platform before relying on it.
 *
 * TaskManager requires `defineTask` to run at app start, so the app root must import this module (see CLAUDE.md).
 */
export const TASK_NAME = 'location-tracking-report';
const STORAGE_KEY = 'location-tracking:queue';

const asyncStorageQueue: QueueStorage = {
  async load() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  async save(readings) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
  },
};

const toFix = (l: Location.LocationObject): Fix => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  accuracyM: l.coords.accuracy,
  timestampMs: l.timestamp,
  mocked: l.mocked,
});

/** iOS needs "Always" for background updates; "When in use" tracks only while the app is open. */
export type PermissionLevel = 'always' | 'when_in_use' | 'denied';

export async function ensurePermissions(): Promise<PermissionLevel> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'always' : 'when_in_use';
}

export function createDeviceTracker(http: HttpUploaderDeps): Tracker {
  const tracker = createTracker({
    uploader: createHttpUploader(http),
    storage: asyncStorageQueue,
    now: () => new Date(),
  });
  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) return; // OS-level failure: the next fix, or the staleness label, tells the story
    const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
    for (const l of locations ?? []) await tracker.onFix(toFix(l));
  });
  return tracker;
}

export async function startTracking(tracker: Tracker): Promise<PermissionLevel> {
  const level = await ensurePermissions();
  if (level === 'denied') return level;
  // One immediate reading so the caregiver sees something right away.
  const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await tracker.onFix(toFix(first));
  if (level === 'always' && !(await Location.hasStartedLocationUpdatesAsync(TASK_NAME))) {
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: REPORT_INTERVAL_MS, // Android only; tracker.ts enforces the cadence on iOS
      deferredUpdatesInterval: REPORT_INTERVAL_MS,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Forget Me Not',
        notificationBody: 'Sharing your location with your caregiver.',
      },
    });
  }
  return level;
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME))
    await Location.stopLocationUpdatesAsync(TASK_NAME);
}
