import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { API_URL } from '@core/client/api';
import { useSession } from '@core/client/session';
import { AppText, Card, Icon } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import { sharingLine, type SharingState } from './model';

/**
 * Patient: starts the device tracker while the patient is signed in, and says honestly whether it is working.
 * Web uses the browser's location (foreground only); phones use expo-location (dev build required).
 */
export function PatientLocationSharing() {
  const { token } = useSession();
  const [state, setState] = useState<SharingState>('starting');
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  useEffect(() => {
    let stop = () => undefined as void | Promise<void>;
    let alive = true;
    const http = { baseUrl: API_URL, getToken: async () => tokenRef.current };
    const run = async () => {
      try {
        if (Platform.OS === 'web') {
          const web = await import('../tracker/web');
          const tracker = web.createWebTracker(http);
          stop = web.startWebTracking(tracker, (r) => alive && setState(r));
        } else {
          const dev = await import('../tracker/expo');
          const tracker = dev.createDeviceTracker(http);
          const level = await dev.startTracking(tracker);
          if (alive) setState(level === 'denied' ? 'denied' : 'started');
        }
      } catch {
        if (alive) setState('unavailable');
      }
    };
    void run();
    return () => {
      alive = false;
      void stop();
    };
  }, []);

  const ok = state === 'started';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="home" size={30} color={ok ? palette.primary : palette.text} />
        <AppText>{sharingLine(state)}</AppText>
      </View>
    </Card>
  );
}
