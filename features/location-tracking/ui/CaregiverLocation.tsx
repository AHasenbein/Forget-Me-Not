import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { ApiError } from '@core/client/api';
import { formatTime } from '@core/client/format';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon, Row } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { LocationReading } from '@contracts/location';
import { FindThem } from './FindThem';
import { caregiverError, lastSeenLine, mapsUrl } from './model';

const BASE = '/api/location-tracking';

/**
 * Caregiver: the patient's last known location. It is NOT read when the dashboard opens: every read is
 * audit-logged, so it is read only when the caregiver asks ("Show last location" / "Refresh"). Who looked is in the
 * "Worth knowing" part of the "Needs you" box (`LocationWorthKnowing`), not here.
 */
export function CaregiverLocation() {
  const { api, token } = useSession();
  const [loc, setLoc] = useState<LocationReading | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // Reset when the signed-in person changes (demo persona switch).
  useEffect(() => {
    setLoc(null);
    setAsked(false);
  }, [token]);

  const read = async () => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      setLoc((await api<{ location: LocationReading | null }>('GET', `${BASE}/location`)).location);
      setAsked(true);
    } catch (e) {
      setProblem(caregiverError(e instanceof ApiError ? e.code : 'offline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="home" size={30} color={palette.primary} />
        <View style={{ flex: 1 }}>
          <AppText variant="title">Location</AppText>
        </View>
      </View>
      {asked ? (
        <>
          <AppText tone={!loc || loc.stale ? 'warn' : undefined}>
            {lastSeenLine(loc, (iso) => formatTime(iso))}
          </AppText>
          <AppText variant="small" tone="muted">
            Phones share their position about every 5 minutes, and can stop when the battery is low
            or the app is closed. No update never means they are safe.
          </AppText>
          <Row gap={8}>
            {loc ? (
              <BigButton
                label="Open in Maps"
                onPress={() => Linking.openURL(mapsUrl(loc.lat, loc.lng))}
              />
            ) : null}
            <BigButton tone="ghost" label="Refresh" busy={busy} onPress={read} />
          </Row>
        </>
      ) : (
        <>
          <AppText variant="small" tone="muted">
            Every look is recorded; see “Worth knowing” for who else checked.
          </AppText>
          <BigButton label="Show last location" busy={busy} onPress={read} />
        </>
      )}
      {problem ? <AppText tone="danger">{problem}</AppText> : null}
      <FindThem />
    </Card>
  );
}
