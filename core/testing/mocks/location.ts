import type {
  GeofenceEvent,
  GeofenceSpec,
  LocationReadContract,
  LocationReading,
} from '@contracts/location';

export interface Point {
  lat: number;
  lng: number;
}

const R = 6_371_000;
export function distanceM(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line simulated GPS path from `from` to `to` in `steps` points (inclusive). */
export function simulatePath(from: Point, to: Point, steps = 10): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    lat: from.lat + ((to.lat - from.lat) * i) / steps,
    lng: from.lng + ((to.lng - from.lng) * i) / steps,
  }));
}

/** Enter/exit events produced by walking a path across one geofence (no debounce: raw crossings). */
export function geofenceCrossings(
  path: Point[],
  zone: GeofenceSpec,
  startAt = Date.now(),
): GeofenceEvent[] {
  const events: GeofenceEvent[] = [];
  let inside: boolean | null = null;
  path.forEach((p, i) => {
    const now = distanceM(p, zone.center) <= zone.radiusM;
    if (inside !== null && now !== inside)
      events.push({
        geofenceId: zone.id,
        patientId: zone.patientId,
        kind: now ? 'enter' : 'exit',
        at: new Date(startAt + i * 1000).toISOString(),
      });
    inside = now;
  });
  return events;
}

/** In-memory LocationReadContract. `allow` decides who may read (fail closed by default). */
export function createMockLocation(
  opts: { reading?: LocationReading | null; allow?: (requesterId: string) => boolean } = {},
) {
  const handlers = new Set<(e: GeofenceEvent) => void>();
  const reads: { requesterId: string; purpose: string }[] = []; // stands in for the audit log
  const contract: LocationReadContract = {
    async getLastKnown(req) {
      reads.push({ requesterId: req.requesterId, purpose: req.purpose });
      if (!(opts.allow?.(req.requesterId) ?? false)) return null;
      return opts.reading ?? null;
    },
    async registerGeofence() {},
    async removeGeofence() {},
    onGeofenceEvent(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
  return { contract, reads, emitGeofence: (e: GeofenceEvent) => handlers.forEach((h) => h(e)) };
}
