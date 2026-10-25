import type { LocationReading } from '@contracts/location';

/** What the caregiver's views list needs. No coordinates and no ids are shown. */
export interface ViewRow {
  id: string;
  purpose: string;
  outcome: 'served' | 'no_data' | 'denied';
  at: string;
  /** Set by the server: this look was the signed-in caregiver's own. */
  byYou?: boolean;
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
  find_session: 'Started a find-them session',
  safezone_eval: 'Safe-zone check',
};

/** One row of the "who looked" list, in plain words. Unknown purposes fall back safely. */
export function viewLabel(row: Pick<ViewRow, 'purpose' | 'outcome'>): string {
  if (row.purpose === 'find_session') return 'Started a find-them session';
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

/** One line of the dashboard's "Worth knowing" box: something someone ELSE did, grouped. */
export interface Notable {
  key: string;
  text: string;
  count: number;
  lastAt: string;
  tone?: 'danger';
}

function notable(row: ViewRow): Omit<Notable, 'count' | 'lastAt'> | null {
  // A blocked attempt always matters, whoever it was.
  if (row.outcome === 'denied')
    return {
      key: 'denied',
      text: 'Someone without permission tried to see the location (blocked)',
      tone: 'danger',
    };
  if (row.byYou) return null;
  switch (row.purpose) {
    case 'circle_view':
      return { key: 'circle', text: 'A family member looked at the location' };
    case 'caregiver_view':
      return { key: 'caregiver', text: 'Another caregiver looked at the location' };
    case 'find_session':
      return { key: 'find', text: 'Another caregiver started a find-them session' };
    default:
      return null; // automatic reads (lost-button alert, safe-zone check): in the full record only
  }
}

/**
 * What the caregiver should know about who looked, without the noise: your own looks and automatic reads are left
 * out (they stay in the full record). Rows come newest first; repeats are grouped. Blocked attempts come first.
 */
export function worthKnowing(rows: readonly ViewRow[]): Notable[] {
  const groups = new Map<string, Notable>();
  for (const r of rows) {
    const n = notable(r);
    if (!n) continue;
    const g = groups.get(n.key);
    if (g) g.count++;
    else groups.set(n.key, { ...n, count: 1, lastAt: r.at });
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'),
  );
}

/** "A family member looked at the location (3 times). Last: Oct 24, 8:12 PM." */
export function notableLine(n: Notable, fmt: (iso: string) => string): string {
  return `${n.text}${n.count > 1 ? ` (${n.count} times)` : ''}. Last: ${fmt(n.lastAt)}.`;
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
