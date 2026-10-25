import { View } from 'react-native';
import { usePoll } from '@core/client/hooks';
import { formatTime } from '@core/client/format';
import { useSession } from '@core/client/session';
import { AppText, Badge, Card } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import { POLL_MS, caregiverLine, flagText, sourceText, type CaregiverScan } from './model';

const SHOWN = 4;

/** Caregiver: the bills the patient has shown lately, in the same simple terms, with warning signs and where each reading came from. Renders nothing until there is one. */
export function CaregiverBills() {
  const { api, token } = useSession();
  const { data } = usePoll(
    () => api<{ scans: CaregiverScan[] }>('GET', '/api/bill-reader/scans'),
    POLL_MS,
    [token],
  );
  const scans = data?.scans ?? [];
  if (scans.length === 0) return null;
  const flagged = scans.some((s) => s.outcome === 'flagged');

  return (
    <Card tone={flagged ? 'danger' : 'neutral'}>
      <AppText variant="title">Bills they showed</AppText>
      {scans.slice(0, SHOWN).map((s) => (
        <View
          key={s.id}
          style={{ gap: 4, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            {s.outcome === 'flagged' ? <Badge tone="danger" label="Looks like a scam" /> : null}
            {s.outcome === 'unclear' ? <Badge tone="warn" label="Needs a look" /> : null}
            <AppText variant="small" tone="muted">
              {formatTime(s.createdAt)} · {sourceText(s.source, s.outcome)}
            </AppText>
          </View>
          <AppText>{caregiverLine(s)}</AppText>
          {s.redFlags.map((f) => (
            <AppText key={f} variant="small" tone="danger">
              This {flagText(f)}.
            </AppText>
          ))}
        </View>
      ))}
      <AppText variant="small" tone="muted">
        Nothing here pays a bill. They were told to show you anything that looks strange.
      </AppText>
    </Card>
  );
}
