/** Browser-only helpers for the caregiver's own position and compass heading. Everything degrades to null/unsupported. */
import type { Point } from './find';

type IosOrientation = DeviceOrientationEvent & { webkitCompassHeading?: number };

/** iOS asks for motion permission and only from a tap. Resolves false if refused or unsupported. */
export async function allowCompass(): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
  const req = (
    DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
  ).requestPermission;
  if (!req) return true; // Android / desktop: no prompt
  try {
    return (await req()) === 'granted';
  } catch {
    return false;
  }
}

/** Calls back with degrees clockwise from north (0-360). Returns a stop function. */
export function watchHeading(onHeading: (deg: number) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: Event) => {
    const o = e as IosOrientation;
    if (typeof o.webkitCompassHeading === 'number') return onHeading(o.webkitCompassHeading); // iOS
    if (o.absolute && typeof o.alpha === 'number') onHeading((360 - o.alpha) % 360); // Android
  };
  window.addEventListener('deviceorientationabsolute', handler);
  window.addEventListener('deviceorientation', handler);
  return () => {
    window.removeEventListener('deviceorientationabsolute', handler);
    window.removeEventListener('deviceorientation', handler);
  };
}

/** The caregiver's own high-accuracy position. Never sent anywhere: it stays on this device. */
export function watchMyPosition(
  onPoint: (p: Point) => void,
  onError: (denied: boolean) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError(false);
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onPoint({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
    (e) => onError(e.code === e.PERMISSION_DENIED),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
