import { describe, expect, it } from 'vitest';
import {
  arrowRotationDeg,
  bearingDeg,
  compassWord,
  distanceLine,
  distanceM,
  findLine,
  guide,
} from '../../ui/find';

const p = (lat: number, lng: number, accuracyM = 5) => ({ lat, lng, accuracyM });

describe('find maths', () => {
  it('distance: ~111 m per 0.001 degree of latitude', () => {
    expect(distanceM(p(40, -74), p(40.001, -74))).toBeGreaterThan(110);
    expect(distanceM(p(40, -74), p(40.001, -74))).toBeLessThan(112);
    expect(distanceM(p(40, -74), p(40, -74))).toBe(0);
  });
  it('bearing: cardinal directions', () => {
    expect(Math.round(bearingDeg(p(40, -74), p(41, -74)))).toBe(0);
    expect(Math.round(bearingDeg(p(40, -74), p(40, -73)))).toBe(90);
    expect(Math.round(bearingDeg(p(40, -74), p(39, -74)))).toBe(180);
    expect(Math.round(bearingDeg(p(40, -74), p(40, -75)))).toBe(270);
  });
  it('arrow subtracts the phone heading and wraps', () => {
    expect(arrowRotationDeg(90, 90)).toBe(0);
    expect(arrowRotationDeg(10, 350)).toBe(20);
    expect(arrowRotationDeg(45, null)).toBe(45);
  });
  it('too close to tell when inside combined GPS uncertainty', () => {
    expect(guide(p(40, -74, 20), p(40.0001, -74, 20)).tooCloseToTell).toBe(true);
    expect(guide(p(40, -74, 5), p(40.001, -74, 5)).tooCloseToTell).toBe(false);
  });
  it('rounds distance and never claims metre precision', () => {
    expect(distanceLine(3)).toBe('less than 10 m');
    expect(distanceLine(43)).toBe('about 45 m');
    expect(distanceLine(437)).toBe('about 440 m');
    expect(distanceLine(1234)).toBe('about 1.2 km');
  });
  it('compass words and honest sentences', () => {
    expect(compassWord(44)).toBe('north-east');
    expect(compassWord(359)).toBe('north');
    const far = guide(p(40, -74), p(40.001, -74));
    expect(findLine(far, false, 3)).toContain('Head north');
    expect(findLine(far, true, 3)).toContain('Follow the arrow');
    expect(findLine(far, true, 90)).toContain('90 seconds ago');
    expect(findLine(guide(p(40, -74, 30), p(40, -74, 30)), true, 1)).toContain('very close');
  });
});
