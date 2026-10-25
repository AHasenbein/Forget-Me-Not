import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIND_REPORT_INTERVAL_MS } from '../constants';
import { createHttpUploader, type HttpUploaderDeps } from './http';
import { createTracker, type Tracker } from './tracker';
import type { Fix, QueueStorage, Reading } from './types';

/**
 * Browser device wiring: `navigator.geolocation` (Chrome answers it with Google's location service, so no API key).
 * Foreground only: a closed tab reports nothing and the caregiver sees "last seen". Same tracker as the phone path.
 */
const STORAGE_KEY = 'location-tracking:queue';

const queueStorage: QueueStorage = {
  async load() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  async save(readings) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
  },
};

export type WebTrackingResult = 'started' | 'denied' | 'unavailable';

export function createWebTracker(http: HttpUploaderDeps): Tracker {
  return createTracker({
    uploader: createHttpUploader(http),
    storage: queueStorage,
    now: () => new Date(),
  });
}

/** Find-them session: fast cadence, nothing persisted (a 3-second-old position is worthless after a restart). */
export function createFastWebTracker(http: HttpUploaderDeps): Tracker {
  let saved: Reading[] = [];
  return createTracker({
    uploader: createHttpUploader(http),
    storage: { load: async () => saved, save: async (r) => void (saved = r) },
    now: () => new Date(),
    intervalMs: FIND_REPORT_INTERVAL_MS,
  });
}

const toFix = (p: GeolocationPosition): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyM: p.coords.accuracy,
  timestampMs: p.timestamp,
});

/** Starts watching; resolves once the browser has answered the permission prompt. Returns a stop function. */
export function startWebTracking(
  tracker: Tracker,
  onResult: (r: WebTrackingResult) => void,
  precise = false,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onResult('unavailable');
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (p) => {
      onResult('started');
      void tracker.onFix(toFix(p));
    },
    (e) => onResult(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
    precise
      ? { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }
      : { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/**
 * `watchPosition` only fires when the browser thinks the position changed, so a device sitting still goes quiet and
 * the caregiver sees "old". Asking again on the report cadence keeps a still patient fresh (the tracker throttles).
 */
export function refreshWebPosition(tracker: Tracker, precise = false): Promise<void> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve();
    navigator.geolocation.getCurrentPosition(
      (p) => void tracker.onFix(toFix(p)).finally(resolve),
      () => resolve(), // the watcher already reports denied / unavailable
      // While finding it is asked every few seconds: a slow lookup must not pile up behind the next one.
      {
        enableHighAccuracy: precise,
        maximumAge: 0,
        timeout: precise ? FIND_REPORT_INTERVAL_MS : 30_000,
      },
    );
  });
}
