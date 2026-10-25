import AsyncStorage from '@react-native-async-storage/async-storage';
import { createHttpUploader, type HttpUploaderDeps } from './http';
import { createTracker, type Tracker } from './tracker';
import type { Fix, QueueStorage } from './types';

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
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
