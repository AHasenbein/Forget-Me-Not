import { useState } from 'react';
import { View } from 'react-native';
import { formatTime } from '@core/client/format';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import { AppText, Badge, BigButton, Card } from '@core/design-system/components';
import { caregiverTitle, signalWords, type CallDetail, type CallItem } from './model';

const BASE = '/api/scam-call-guard';
const SHOWN = 3;

/**
 * Caregiver: suspicious phone calls, newest first, refreshed every few seconds so an alert shows up while the call is
 * still going. The AI overview is NOT loaded with the list: opening it is audit-logged, so it is read only on request.
 */
export function CaregiverCalls() {
  const { api, token } = useSession();
  const list = usePoll(() => api<{ calls: CallItem[] }>('GET', `${BASE}/calls`), 3000, [token]);
  const [open, setOpen] = useState<CallDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const calls = list.data?.calls ?? [];
  const shown = calls
    .filter((c) => c.warning !== 'none' || c.needsReview || c.status === 'active')
    .slice(0, SHOWN);

  const see = async (id: string) => {
    setBusy(true);
    try {
      setOpen((await api<{ call: CallDetail }>('GET', `${BASE}/calls/${id}`)).call);
    } catch {
      // list keeps working; the overview can be asked for again
    } finally {
      setBusy(false);
    }
  };
  const mark = async (id: string, outcome: 'confirmed_scam' | 'false_alarm') => {
    setBusy(true);
    try {
      await api('POST', `${BASE}/calls/${id}/review`, { outcome });
      setOpen(null);
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  if (shown.length === 0)
    return (
      <Card>
        <AppText variant="title">Phone calls</AppText>
        <AppText tone="muted">No suspicious calls.</AppText>
      </Card>
    );

  return (
    <View style={{ gap: 12 }}>
      {shown.map((c) => {
        const tone =
          c.warning === 'danger' ? 'danger' : c.warning === 'caution' ? 'warn' : 'neutral';
        const detail = open?.id === c.id ? open : null;
        return (
          <Card key={c.id} tone={tone}>
            <View style={{ gap: 10 }}>
              <Badge
                tone={tone}
                label={c.status === 'active' ? 'Call in progress' : formatTime(c.startedAt)}
              />
              <AppText variant="title">{caregiverTitle(c)}</AppText>
              {c.signals.length > 0 ? (
                <AppText>The caller {signalWords(c.signals).join(', ')}.</AppText>
              ) : null}
              {c.review ? (
                <AppText tone="muted">
                  You marked this {c.review === 'confirmed_scam' ? 'a scam' : 'not a scam'}.
                </AppText>
              ) : null}
              {detail ? (
                <View style={{ gap: 8 }}>
                  <AppText variant="small" tone="muted">
                    AI overview. It can be wrong, so use your own judgement.
                  </AppText>
                  <AppText>{detail.summary ?? 'No overview yet.'}</AppText>
                  {detail.aiDisagrees ? (
                    <AppText variant="small" tone="warn">
                      The AI thought it was fine, but the call had warning signs.
                    </AppText>
                  ) : null}
                  {!c.review ? (
                    <View style={{ gap: 8 }}>
                      <BigButton
                        label="Yes, a scam"
                        tone="danger"
                        busy={busy}
                        onPress={() => mark(c.id, 'confirmed_scam')}
                      />
                      <BigButton
                        label="Not a scam"
                        tone="ghost"
                        busy={busy}
                        onPress={() => mark(c.id, 'false_alarm')}
                      />
                    </View>
                  ) : null}
                </View>
              ) : (
                <BigButton
                  label="See what the AI heard"
                  tone="ghost"
                  busy={busy}
                  onPress={() => see(c.id)}
                />
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
