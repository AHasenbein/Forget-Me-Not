import type { LocationReading } from '@contracts/location';
import type { Alert, PatientStatus } from '../schemas';

/** What the patient is told. Never a location, a name or a code. "Told" is only said when a push was delivered. */
export function patientStatusText(status: PatientStatus): { title: string; body: string } {
  switch (status) {
    case 'on_the_way':
      return { title: 'Your caregiver is on the way', body: 'Please stay where you are.' };
    case 'no_one_reachable':
      return {
        title: 'We’re still trying to reach your caregiver',
        body: 'Please stay where you are. We keep trying.',
      };
    default:
      return { title: 'Your caregiver has been told', body: 'Please stay where you are.' };
  }
}

/** Plain words only. A 401 (session expired) must not look like a logout. */
export function patientError(code: string): string {
  return code === 'offline'
    ? 'I can’t reach the app right now. Please try again.'
    : 'That didn’t work. Please try again.';
}

export function caregiverError(code: string): string {
  switch (code) {
    case 'offline':
      return 'Can’t reach the server.';
    case 'resolved':
    case 'expired':
      return 'This alert is already closed.';
    case 'not_found':
      return 'That alert no longer exists.';
    default:
      return 'That didn’t work. Please try again.';
  }
}

/**
 * How often to ask the server. With no alert open the caregiver call reads no location, so it is cheap and can
 * be frequent. While an alert is open every call reads (and audit-logs) the location, so keep that rare.
 */
export const POLL_IDLE_MS = 5_000;
export const POLL_ALERT_MS = 30_000;
export const alertPollMs = (alertOpen: boolean) => (alertOpen ? POLL_ALERT_MS : POLL_IDLE_MS);

/** Caregiver line about whether their phone was reached. */
export function deliveryLine(a: Pick<Alert, 'delivered' | 'attempts'>): string {
  return a.delivered
    ? 'Your phone was notified.'
    : 'We could not reach your phone yet. We keep trying until you respond.';
}

/** "Last seen 8:14 PM, about 20 m off. This may be out of date." Never "now". Null location is stated plainly. */
export function lastSeenLine(
  loc: Pick<LocationReading, 'recordedAt' | 'accuracyM' | 'stale'> | null,
  fmt: (iso: string) => string,
): string {
  if (!loc) return 'No location has been shared yet.';
  const acc = Math.round(loc.accuracyM);
  const base = `Last seen at ${fmt(loc.recordedAt)} (within about ${acc} m).`;
  return loc.stale ? `${base} This is old, they may have moved.` : base;
}

/** User-initiated only: opening the link is what sends the coordinates to a map provider. */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lng.toFixed(5)}`;
}
