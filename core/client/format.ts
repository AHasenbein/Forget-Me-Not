/** "8:02 AM" for an ISO instant, in the given IANA zone (falls back to the device zone). */
export function formatTime(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
      new Date(iso),
    );
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function daysLabel(days: readonly number[]): string {
  if (days.length === 7) return 'Every day';
  return [...days]
    .sort()
    .map((d) => DAY_NAMES[d])
    .join(', ');
}
