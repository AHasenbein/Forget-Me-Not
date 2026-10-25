import { useState } from 'react';
import { View } from 'react-native';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import { AppText, Chip, Row } from '@core/design-system/components';
import { notableLine, viewLabel, viewTime, worthKnowing, type ViewRow } from './model';

const FULL_RECORD = 20;

/**
 * Caregiver "Worth knowing" box: only what someone ELSE did with the location (a family member looked, a blocked
 * attempt). Every look is still recorded; the full record is one tap away. Reading this list reads no location.
 */
export function LocationWorthKnowing() {
  const { api, token } = useSession();
  const views = usePoll(
    () => api<{ views: ViewRow[] }>('GET', '/api/location-tracking/views'),
    30_000,
    [token],
  );
  const [open, setOpen] = useState(false);
  const rows = views.data?.views ?? [];
  const items = worthKnowing(rows);

  return (
    <View style={{ gap: 6 }}>
      {!views.data ? (
        <AppText tone={views.error ? 'warn' : 'muted'}>
          {views.error
            ? 'Can’t check who looked at the location right now.'
            : 'Checking who looked at the location…'}
        </AppText>
      ) : items.length === 0 ? (
        <AppText tone="muted">Location: no one else looked.</AppText>
      ) : (
        items.map((n) => (
          <AppText key={n.key} tone={n.tone}>
            {notableLine(n, (iso) => viewTime(iso))}
          </AppText>
        ))
      )}
      {rows.length ? (
        <Row gap={8}>
          <Chip
            label={open ? 'Hide location record' : 'Full location record'}
            selected={open}
            onPress={() => setOpen((o) => !o)}
          />
        </Row>
      ) : null}
      {(open ? rows.slice(0, FULL_RECORD) : []).map((v) => (
        <View key={v.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <AppText variant="small" tone={v.outcome === 'denied' ? 'danger' : undefined}>
              {v.byYou ? `${viewLabel(v)} (you)` : viewLabel(v)}
            </AppText>
          </View>
          <AppText variant="small" tone="muted">
            {viewTime(v.at)}
          </AppText>
        </View>
      ))}
    </View>
  );
}
