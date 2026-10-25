import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { ApiError } from '@core/client/api';
import { formatTime } from '@core/client/format';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon, Row } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { LocationReading } from '@contracts/location';
import type { Alert } from '../schemas';
import { caregiverError, deliveryLine, lastSeenLine, mapsUrl } from './model';
import { useActive } from './useActive';

const BASE = '/api/lost-button';
interface Active {
  alert: Alert | null;
  location: LocationReading | null;
}

/** Caregiver: renders NOTHING until the patient presses. Urgent card first on the dashboard when they do. */
export function CaregiverAlert() {
  const { api, token } = useSession();
  const { data, reload } = useActive(() => api<Active>('GET', `${BASE}/alerts/active`), [token]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [confirmSafe, setConfirmSafe] = useState(false);
  const alert = data?.alert ?? null;
  // "Tap again" expires, so a stray later tap cannot close a real alert.
  useEffect(() => {
    if (!confirmSafe) return;
    const t = setTimeout(() => setConfirmSafe(false), 5000);
    return () => clearTimeout(t);
  }, [confirmSafe]);
  if (!alert) return null;

  const act = async (path: string) => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      await api('POST', `${BASE}/alerts/${alert.id}/${path}`, {});
    } catch (e) {
      setProblem(caregiverError(e instanceof ApiError ? e.code : 'offline'));
    } finally {
      setBusy(false);
      reload();
    }
  };
  const loc = data?.location ?? null;
  const onTheWay = alert.status === 'acknowledged';

  return (
    <Card tone="danger">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="alert" size={40} color={palette.danger} />
        <View style={{ flex: 1 }}>
          <AppText variant="title" tone="danger">
            The patient pressed “I’m lost”
          </AppText>
          <AppText variant="small" tone="muted">
            Pressed at {formatTime(alert.createdAt)} ·{' '}
            {onTheWay ? 'You are on your way' : 'Waiting for you'}
          </AppText>
        </View>
      </View>
      <AppText>{deliveryLine(alert)}</AppText>
      <AppText tone={loc?.stale || !loc ? 'warn' : undefined}>
        {lastSeenLine(loc, (iso) => formatTime(iso))}
      </AppText>
      <AppText variant="small" tone="muted">
        A missing or old location never means they are safe. Call them, or go to where they were
        last seen.
      </AppText>
      <Row gap={12}>
        {loc ? (
          <BigButton
            tone="ghost"
            label="Open in Maps"
            onPress={() => Linking.openURL(mapsUrl(loc.lat, loc.lng))}
          />
        ) : null}
        <BigButton tone="ghost" label="Refresh" busy={busy} onPress={async () => reload()} />
      </Row>
      {!onTheWay ? (
        <BigButton label="I’m on my way" busy={busy} onPress={() => act('acknowledge')} />
      ) : null}
      <BigButton
        tone={confirmSafe ? 'danger' : 'ghost'}
        label={confirmSafe ? 'Tap again: they are safe' : 'They are safe'}
        busy={busy}
        onPress={() => {
          if (!confirmSafe) return setConfirmSafe(true);
          setConfirmSafe(false);
          return act('resolve');
        }}
      />
      {problem ? <AppText tone="danger">{problem}</AppText> : null}
    </Card>
  );
}
