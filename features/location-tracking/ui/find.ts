/** Pure maths for the "find them in a crowd" arrow. No React, no I/O: unit-tested. */
export interface Point {
  lat: number;
  lng: number;
  accuracyM: number;
}

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Straight-line distance in metres (haversine). */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a to b, degrees clockwise from true north (0-360). */
export function bearingDeg(a: Point, b: Point): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return norm360(deg(Math.atan2(y, x)));
}

/**
 * Where the on-screen arrow points: bearing minus the way the phone faces. Without a compass heading the arrow is
 * "north-up" (the bearing itself) and the screen says so.
 */
export function arrowRotationDeg(bearing: number, headingDeg: number | null): number {
  return norm360(bearing - (headingDeg ?? 0));
}

export interface FindGuide {
  distanceM: number;
  bearing: number;
  /** Combined GPS uncertainty of both phones. Under this distance the arrow is not trustworthy. */
  uncertaintyM: number;
  tooCloseToTell: boolean;
}

export function guide(me: Point, them: Point): FindGuide {
  const d = distanceM(me, them);
  const uncertaintyM = Math.hypot(me.accuracyM, them.accuracyM);
  return {
    distanceM: d,
    bearing: bearingDeg(me, them),
    uncertaintyM,
    tooCloseToTell: d <= uncertaintyM,
  };
}

/** "about 40 m" / "about 1.2 km". Rounded so it never claims metre-level precision it does not have. */
export function distanceLine(m: number): string {
  if (m < 10) return 'less than 10 m';
  if (m < 100) return `about ${Math.round(m / 5) * 5} m`;
  if (m < 1000) return `about ${Math.round(m / 10) * 10} m`;
  return `about ${(m / 1000).toFixed(1)} km`;
}

const COMPASS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];
/** Plain-words fallback next to the arrow ("head north-east"), so it also works without a compass. */
export const compassWord = (bearing: number) => COMPASS[Math.round(norm360(bearing) / 45) % 8]!;

/** One honest sentence under the arrow. */
export function findLine(g: FindGuide, hasHeading: boolean, theirAgeSec: number): string {
  const age =
    theirAgeSec > 30
      ? ` Their last update was ${Math.round(theirAgeSec)} seconds ago, so their phone may be asleep or the app closed.`
      : '';
  if (g.tooCloseToTell)
    return `You are very close (${distanceLine(g.distanceM)}). Look around: GPS cannot tell more.${age}`;
  const where = hasHeading ? 'Follow the arrow' : `Head ${compassWord(g.bearing)}`;
  return `${where}. They are ${distanceLine(g.distanceM)} away.${age}`;
}

/** Outer ring of the built-in map, in metres: the smallest "nice" step that keeps them on the map with some margin. */
const RINGS_M = [25, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 50_000, 100_000, 500_000];
export function mapRingM(distance: number): number {
  return RINGS_M.find((r) => distance * 1.15 <= r) ?? RINGS_M.at(-1)!;
}

/** Pixel offset from the map centre (the caregiver), north up: x grows east, y grows DOWN (screen), clamped to the edge. */
export function mapOffsetPx(
  g: Pick<FindGuide, 'distanceM' | 'bearing'>,
  radiusPx: number,
  ringM: number,
) {
  const r = Math.min(g.distanceM / ringM, 1) * radiusPx;
  const b = rad(g.bearing);
  return { x: r * Math.sin(b), y: -r * Math.cos(b) };
}

/** Size of the "they could be anywhere in here" circle, in pixels, never smaller than the dot. */
export const accuracyPx = (accuracyM: number, radiusPx: number, ringM: number) =>
  Math.max(6, (accuracyM / ringM) * radiusPx);
