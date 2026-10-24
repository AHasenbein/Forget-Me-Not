/** Wall-clock parts of `date` in an IANA zone, e.g. to assert "8:00 local" across a DST change. */
export function localParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

/** Controllable clock for escalation timeouts, snooze, and DST tests. No real timers involved. */
export class FakeClock {
  private t: number;
  private timers: { at: number; fn: () => void }[] = [];
  constructor(startIso = '2026-01-01T12:00:00Z') {
    this.t = Date.parse(startIso);
  }
  now = () => new Date(this.t);
  schedule(fn: () => void, delayMs: number) {
    this.timers.push({ at: this.t + delayMs, fn });
  }
  /** Moves time forward, firing due timers in order (timers may schedule more timers). */
  advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > target) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = target;
  }
  setTime(iso: string) {
    this.t = Date.parse(iso);
  }
}
