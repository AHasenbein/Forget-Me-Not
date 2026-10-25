import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@core/client/api';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import { AppText, BigButton } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { LocationReading } from '@contracts/location';
import { allowCompass, watchHeading, watchMyPosition } from './compass';
import { arrowRotationDeg, findLine, guide, type Point } from './find';

const BASE = '/api/location-tracking';

interface FindState {
  active: boolean;
  expiresAt: string | null;
}

/**
 * Caregiver: "Find them". Starts a short, visible, time-limited session (the patient's phone is told, and reports
 * precisely every few seconds), then points an arrow at them. Your own position and compass stay on this device.
 */
export function FindThem() {
  const { api, token } = useSession();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [me, setMe] = useState<Point | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [them, setThem] = useState<LocationReading | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const activeRef = useRef(false);
  activeRef.current = active;

  // Poll the patient's precise position while the session is on. Ending is decided by the server clock.
  const poll = usePoll(
    async () => {
      if (!activeRef.current) return null;
      const f = await api<FindState>('GET', `${BASE}/find`);
      if (!f.active) {
        setActive(false);
        return null;
      }
      const r = await api<{ location: LocationReading | null }>('GET', `${BASE}/location`);
      setThem(r.location);
      setNowMs(Date.now());
      return r.location;
    },
    3000,
    [token],
  );

  useEffect(() => {
    if (!active) return;
    const stopPos = watchMyPosition(setMe, (denied) =>
      setProblem(
        denied
          ? 'Turn on location for this page, so we can point the way.'
          : 'Your location is not available.',
      ),
    );
    const stopHead = watchHeading(setHeading);
    return () => {
      stopPos();
      stopHead();
      setMe(null);
      setHeading(null);
    };
  }, [active]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      await allowCompass(); // must run inside the tap (iOS); the arrow still works north-up without it
      const f = await api<FindState>('POST', `${BASE}/find`, {});
      setActive(f.active);
      setThem(null);
    } catch (e) {
      setProblem(
        e instanceof ApiError && e.code === 'offline'
          ? 'Can’t reach the server.'
          : 'That didn’t work. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setActive(false);
    try {
      await api<FindState>('POST', `${BASE}/find/stop`, {});
    } catch {
      // the session also ends by itself on the server
    }
  };

  void poll;
  if (!active) {
    return (
      <View style={{ gap: 8 }}>
        <AppText variant="small" tone="muted">
          Finding them in a crowd: their phone is told, then reports exactly where they are for 10
          minutes. This is recorded below.
        </AppText>
        <BigButton tone="ghost" label="Find them" busy={busy} onPress={start} />
        {problem ? <AppText tone="danger">{problem}</AppText> : null}
      </View>
    );
  }

  const g = me && them ? guide(me, them) : null;
  const ageSec = them ? Math.max(0, (nowMs - Date.parse(them.recordedAt)) / 1000) : 0;
  return (
    <View style={{ gap: 12, alignItems: 'center' }}>
      {g ? (
        <>
          <View
            style={{
              transform: [{ rotate: `${arrowRotationDeg(g.bearing, heading)}deg` }],
              opacity: g.tooCloseToTell ? 0.3 : 1,
            }}
          >
            <AppText variant="title" tone={g.tooCloseToTell ? 'muted' : undefined}>
              ⬆
            </AppText>
          </View>
          <AppText>{findLine(g, heading !== null, ageSec)}</AppText>
          {heading === null ? (
            <AppText variant="small" tone="muted">
              No compass on this device, so the arrow points north. Use the words above.
            </AppText>
          ) : null}
        </>
      ) : (
        <AppText tone="muted">
          {them ? 'Finding your own position…' : 'Waiting for their phone to report…'}
        </AppText>
      )}
      {problem ? <AppText tone="danger">{problem}</AppText> : null}
      <View style={{ borderTopWidth: 1, borderTopColor: palette.border, width: '100%' }} />
      <BigButton tone="ghost" label="Stop" onPress={stop} />
    </View>
  );
}
