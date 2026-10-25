import { View } from 'react-native';
import { AppText } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import { accuracyPx, mapOffsetPx, mapRingM, type FindGuide, type Point } from './find';

const SIZE = 280;
const R = SIZE / 2;

/**
 * Built-in map: you in the centre, them as a dot, distance rings, and a faint circle for GPS uncertainty.
 * Drawn here, with NO map tiles and no third-party requests, so looking never reveals the area to a map provider.
 * North is up; with a compass the whole map turns so "up" is the way you are facing.
 */
export function FindMap({
  g,
  them,
  heading,
}: {
  g: FindGuide;
  them: Point;
  heading: number | null;
}) {
  const ring = mapRingM(g.distanceM);
  const o = mapOffsetPx(g, R, ring);
  const acc = accuracyPx(them.accuracyM, R, ring);
  const label = ring >= 1000 ? `${ring / 1000} km` : `${ring} m`;
  const dot = 18;
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View
        accessibilityLabel="Map. You are in the centre."
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: R,
          borderWidth: 2,
          borderColor: palette.border,
          backgroundColor: palette.card,
          transform: [{ rotate: `${heading === null ? 0 : -heading}deg` }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: R / 2,
            top: R / 2,
            width: R,
            height: R,
            borderRadius: R / 2,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: R - 0.5,
            top: 0,
            width: 1,
            height: SIZE,
            backgroundColor: palette.border,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: R - 0.5,
            left: 0,
            height: 1,
            width: SIZE,
            backgroundColor: palette.border,
          }}
        />
        <View style={{ position: 'absolute', top: 6, left: 0, width: SIZE, alignItems: 'center' }}>
          <AppText variant="small" bold>
            N
          </AppText>
        </View>
        {/* their uncertainty, then their dot */}
        <View
          style={{
            position: 'absolute',
            left: R + o.x - acc,
            top: R + o.y - acc,
            width: acc * 2,
            height: acc * 2,
            borderRadius: acc,
            backgroundColor: palette.danger,
            opacity: 0.18,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: R + o.x - dot / 2,
            top: R + o.y - dot / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: palette.danger,
            borderWidth: 3,
            borderColor: '#fff',
          }}
        />
        {/* you */}
        <View
          style={{
            position: 'absolute',
            left: R - dot / 2,
            top: R - dot / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: palette.primary,
            borderWidth: 3,
            borderColor: '#fff',
          }}
        />
      </View>
      <AppText variant="small" tone="muted">
        Green is you, red is them. Outer ring is {label}.
        {heading === null ? ' Up is north.' : ' Up is the way you are facing.'}
      </AppText>
    </View>
  );
}
