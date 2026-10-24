/**
 * Wall-clock <-> UTC math with Intl only (no date library, so package.json stays conflict-free).
 * DST rules (match Temporal's "compatible"): a local time that does not exist (spring forward)
 * moves forward by the gap; a local time that occurs twice (fall back) uses the FIRST occurrence.
 */
const DAY = 86_400_000;
const fmts = new Map<string, Intl.DateTimeFormat>();

function fmt(timeZone: string) {
  let f = fmts.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    fmts.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    fmt(timeZone);
    return true;
  } catch {
    return false;
  }
}

function wall(ms: number, tz: string) {
  const p = Object.fromEntries(
    fmt(tz)
      .formatToParts(new Date(ms))
      .map((x) => [x.type, +x.value]),
  );
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour!, mi: p.minute!, s: p.second! };
}

function offsetMin(ms: number, tz: string): number {
  const w = wall(ms, tz);
  const base = Math.floor(ms / 1000) * 1000;
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - base) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of `instant` as seen in `tz`. */
export function localDateOf(instant: Date, tz: string): string {
  const w = wall(instant.getTime(), tz);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

/** 0 = Sunday .. 6 = Saturday, for a `YYYY-MM-DD` calendar date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function localTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const before = offsetMin(guess - DAY, tz);
  const after = offsetMin(guess + DAY, tz);
  const valid = [...new Set([before, after])]
    .map((o) => guess - o * 60_000)
    .filter((t) => {
      const w = wall(t, tz);
      return w.y === y && w.m === m && w.d === d && w.h === h && w.mi === mi;
    });
  if (valid.length) return new Date(Math.min(...valid)); // overlap => first occurrence
  return new Date(guess - before * 60_000); // gap => shift forward by the gap
}
