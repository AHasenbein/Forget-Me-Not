import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { API_URL } from '@core/client/api';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import { FIND_REPORT_INTERVAL_MS, REPORT_INTERVAL_MS } from '../constants';
import type { Tracker } from '../tracker/tracker';
import { sharingLine, type SharingState } from './model';

/**
 * Patient: starts the device tracker while the patient is signed in, and says honestly whether it is working.
 * Web uses the browser's location (foreground only); phones use expo-location (dev build required).
 * While the caregiver is finding them, the patient is told and can stop it; on web the reports become precise.
 */
export function PatientLocationSharing() {
  const { token, api } = useSession();
  const [state, setState] = useState<SharingState>('starting');
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  const find = usePoll(() => api<{ active: boolean }>('GET', '/api/location-tracking/find'), 5000, [
    token,
  ]);
  const finding = find.data?.active === true;
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (!finding) setStopped(false);
  }, [finding]);
  const precise = finding && !stopped;

  // Web: ask the browser again on the report cadence; its watcher stays quiet while the patient sits still.
  const webTracker = useRef<Tracker | null>(null);
  usePoll(
    async () => {
      if (Platform.OS !== 'web' || !webTracker.current) return null;
      const web = await import('../tracker/web');
      await web.refreshWebPosition(webTracker.current, precise);
      return null;
    },
    precise ? FIND_REPORT_INTERVAL_MS : REPORT_INTERVAL_MS / 2,
    [precise],
  );

  useEffect(() => {
    let stop = () => undefined as void | Promise<void>;
    let alive = true;
    const http = { baseUrl: API_URL, getToken: async () => tokenRef.current };
    const run = async () => {
      try {
        if (Platform.OS === 'web') {
          const web = await import('../tracker/web');
          if (!alive) return; // unmounted or mode changed while loading: never leave a second watcher running
          const tracker = precise ? web.createFastWebTracker(http) : web.createWebTracker(http);
          webTracker.current = tracker;
          stop = web.startWebTracking(tracker, (r) => alive && setState(r), precise);
        } else {
          const dev = await import('../tracker/expo');
          const tracker = dev.createDeviceTracker(http);
          const session = await dev.startTracking(tracker);
          if (!alive) return session.stop();
          stop = session.stop;
          setState(session.level === 'denied' ? 'denied' : 'started');
        }
      } catch {
        if (alive) setState('unavailable');
      }
    };
    void run();
    return () => {
      alive = false;
      webTracker.current = null;
      void stop();
    };
  }, [precise]);

  const stopFinding = async () => {
    setStopped(true);
    try {
      await api('POST', '/api/location-tracking/find/stop', {});
    } catch {
      // the session also ends by itself on the server
    }
  };

  const ok = state === 'started';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="home" size={30} color={ok ? palette.primary : palette.text} />
        <AppText>{precise ? 'Your family is finding you.' : sharingLine(state)}</AppText>
      </View>
      {precise ? <BigButton tone="ghost" label="Stop sharing" onPress={stopFinding} /> : null}
    </Card>
  );
}
