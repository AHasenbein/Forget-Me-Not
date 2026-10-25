import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { ApiError } from '@core/client/api';
import { formatTime } from '@core/client/format';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon, Row } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { LocationReading } from '@contracts/location';
import { caregiverError, lastSeenLine, mapsUrl, viewLabel, viewTime, type ViewRow } from './model';

const BASE = '/api/location-tracking';
const SHOWN_VIEWS = 5;

/**
 * Caregiver: the patient's last known location. It is NOT read when the dashboard opens: every read is
 * audit-logged, so it is read only when the caregiver asks ("Show last location" / "Refresh"). That keeps the
 * "who looked" list meaningful.
 */
export function CaregiverLocation() {
  const { api, token } = useSession();
  const [loc, setLoc] = useState<LocationReading | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [views, setViews] = useState<ViewRow[]>([]);

  const loadViews = async () => {
    try {
      setViews((await api<{ views: ViewRow[] }>('GET', `${BASE}/views`)).views);
    } catch {
      // the list is secondary; the location card still works without it
    }
  };
  // Reset when the signed-in person changes (demo persona switch).
  useEffect(() => {
    setLoc(null);
    setAsked(false);
    void loadViews();
  }, [token]);

  const read = async () => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      setLoc((await api<{ location: LocationReading | null }>('GET', `${BASE}/location`)).location);
      setAsked(true);
      void loadViews(); // this read is now in the list too
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
          <Row gap={12}>
            {loc ? (
              <BigButton
                tone="ghost"
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
            Looking is recorded below, so you can always see who checked the location.
          </AppText>
          <BigButton label="Show last location" busy={busy} onPress={read} />
        </>
      )}
      {problem ? <AppText tone="danger">{problem}</AppText> : null}

      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 16 }}>
        <AppText variant="small" bold>
          Who looked recently
        </AppText>
        {views.length === 0 ? (
          <AppText variant="small" tone="muted">
            Nobody yet.
          </AppText>
        ) : null}
        {views.slice(0, SHOWN_VIEWS).map((v) => (
          <View key={v.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <AppText variant="small" tone={v.outcome === 'denied' ? 'danger' : undefined}>
                {viewLabel(v)}
              </AppText>
            </View>
            <AppText variant="small" tone="muted">
              {viewTime(v.at)}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}
