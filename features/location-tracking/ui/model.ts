import type { LocationReading } from '@contracts/location';

/** What the caregiver's views list needs. No coordinates and no ids are shown. */
export interface ViewRow {
  id: string;
  purpose: string;
  outcome: 'served' | 'no_data' | 'denied';
  at: string;
}

/**
 * "Last seen at 8:14 PM (within about 20 m)." Never "now": the device reports every 5 minutes at best, and the OS can
 * stop it. Duplicated in lost-button on purpose (features never import each other).
 */
export function lastSeenLine(
  loc: Pick<LocationReading, 'recordedAt' | 'accuracyM' | 'stale'> | null,
  fmt: (iso: string) => string,
): string {
  if (!loc) return 'No location has been shared yet.';
  const base = `Last seen at ${fmt(loc.recordedAt)} (within about ${Math.round(loc.accuracyM)} m).`;
  return loc.stale ? `${base} This is old, they may have moved.` : base;
}

/** User-initiated only: opening the link is what sends the coordinates to a map provider. */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

const WHO: Record<string, string> = {
  caregiver_view: 'Caregiver',
  circle_view: 'Family member',
  lost_button: 'Lost-button alert',
  safezone_eval: 'Safe-zone check',
};

/** One row of the "who looked" list, in plain words. Unknown purposes fall back safely. */
export function viewLabel(row: Pick<ViewRow, 'purpose' | 'outcome'>): string {
  const who = WHO[row.purpose] ?? 'Someone';
  switch (row.outcome) {
    case 'denied':
      return `${who} tried to look (blocked, no permission)`;
    case 'no_data':
      return `${who} looked (nothing to show yet)`;
    default:
      return `${who} looked`;
  }
}

/** "Oct 24, 8:12 PM" in the given zone (views can be days old, so the date matters). */
export function viewTime(iso: string, timeZone?: string): string {
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso));
  }
}

export function caregiverError(code: string): string {
  return code === 'offline' ? 'Can’t reach the server.' : 'That didn’t work. Please try again.';
}

export type SharingState = 'starting' | 'started' | 'denied' | 'unavailable';

/** Patient wording: plain, no jargon, never claims more than is true. */
export function sharingLine(state: SharingState): string {
  switch (state) {
    case 'started':
      return 'Your family can see where you were last.';
    case 'denied':
      return 'Location is turned off. Ask someone to turn it on for you.';
    case 'unavailable':
      return 'We cannot find your location right now.';
    default:
      return 'Finding your location…';
  }
}
