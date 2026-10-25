import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAttention } from '@core/client/attention';
import { usePoll } from '@core/client/hooks';
import { formatTime } from '@core/client/format';
import { useSession } from '@core/client/session';
import { AppText, Badge, BigButton, Card } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import {
  POLL_MS,
  caregiverLine,
  flagText,
  sourceText,
  unseenFlagged,
  type CaregiverScan,
} from './model';

const SHOWN = 4;
/** Scan ids this device marked "Seen it". Only a convenience: without storage they simply count again. */
const SEEN_KEY = 'fmn.billReader.seen';

/** Caregiver: the bills the patient has shown lately, in the same simple terms, with warning signs and where each reading came from. Renders nothing until there is one. */
export function CaregiverBills() {
  const { api, token } = useSession();
  const { data, error } = usePoll(
    () => api<{ scans: CaregiverScan[] }>('GET', '/api/bill-reader/scans'),
    POLL_MS,
    [token],
  );
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        const ids: unknown = v ? JSON.parse(v) : [];
        if (Array.isArray(ids)) setSeen(ids.filter((x): x is string => typeof x === 'string'));
      })
      .catch(() => undefined); // private window / blocked storage: nothing remembered
  }, []);
  const markSeen = (id: string) => {
    const next = [...seen, id].slice(-50);
    setSeen(next);
    void AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  const scans = (data?.scans ?? []).slice(0, SHOWN);
  const open = unseenFlagged(scans, seen).length;
  // A scam-looking bill counts until you mark it "Seen it" (or it drops out of the list).
  useAttention(
    !data && !error
      ? null
      : {
          count: open,
          severity: 'warning',
          what: open
            ? open === 1
              ? 'A bill that looks like a scam'
              : `${open} bills that look like scams`
            : undefined,
          unknown: error ? 'bills' : undefined,
        },
  );
  if (scans.length === 0) return null;

  return (
    <Card tone={open ? 'danger' : 'neutral'}>
      <AppText variant="title">Bills they showed</AppText>
      {scans.map((s) => (
        <View
          key={s.id}
          style={{ gap: 4, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 }}
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
          {s.outcome === 'flagged' && !seen.includes(s.id) ? (
            <BigButton tone="ghost" label="Seen it" onPress={() => markSeen(s.id)} />
          ) : null}
        </View>
      ))}
      <AppText variant="small" tone="muted">
        Nothing here pays a bill. They were told to show you anything that looks strange.
      </AppText>
    </Card>
  );
}
