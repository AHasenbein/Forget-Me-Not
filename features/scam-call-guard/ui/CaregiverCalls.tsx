import { useState } from 'react';
import { View } from 'react-native';
import { useAttention } from '@core/client/attention';
import { formatTime } from '@core/client/format';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import { AppText, Badge, BigButton, Card, Row } from '@core/design-system/components';
import { caregiverTitle, signalWords, type CallDetail, type CallItem } from './model';

const BASE = '/api/scam-call-guard';
const SHOWN = 3;

/**
 * Caregiver: suspicious phone calls you have not answered yet, newest first, refreshed every few seconds so an alert
 * shows up while the call is still going. Renders nothing when there is nothing to look at (the status line says so).
 * The AI overview is NOT loaded with the list: opening it is audit-logged, so it is read only on request.
 */
export function CaregiverCalls() {
  const { api, token } = useSession();
  const list = usePoll(() => api<{ calls: CallItem[] }>('GET', `${BASE}/calls`), 3000, [token]);
  const [open, setOpen] = useState<CallDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const calls = list.data?.calls ?? [];
  // Once you have marked a call, it is answered and leaves the "needs you" row.
  const shown = calls
    .filter((c) => !c.review && (c.warning !== 'none' || c.needsReview || c.status === 'active'))
    .slice(0, SHOWN);
  const toLook = shown.filter((c) => c.warning !== 'none' || c.needsReview);
  const live = toLook.some((c) => c.status === 'active');
  useAttention(
    !list.data && !list.error
      ? null
      : {
          count: toLook.length,
          severity: toLook.some((c) => c.warning === 'danger' || c.status === 'active')
            ? 'urgent'
            : 'warning',
          what: toLook.length
            ? live
              ? 'A suspicious call is happening now'
              : toLook.length === 1
                ? 'A suspicious call'
                : `${toLook.length} suspicious calls`
            : undefined,
          unknown: list.error ? 'phone calls' : undefined,
        },
  );

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

  if (shown.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {shown.map((c) => {
        const tone =
          c.warning === 'danger' ? 'danger' : c.warning === 'caution' ? 'warn' : 'neutral';
        const detail = open?.id === c.id ? open : null;
        return (
          <Card key={c.id} tone={tone}>
            <Badge
              tone={tone}
              label={c.status === 'active' ? 'Call in progress' : formatTime(c.startedAt)}
            />
            <AppText variant="title">{caregiverTitle(c)}</AppText>
            {c.signals.length > 0 ? (
              <AppText>The caller {signalWords(c.signals).join(', ')}.</AppText>
            ) : null}
            {detail ? (
              <>
                <AppText variant="small" tone="muted">
                  AI overview. It can be wrong, so use your own judgement.
                </AppText>
                <AppText>{detail.summary ?? 'No overview yet.'}</AppText>
                {detail.aiDisagrees ? (
                  <AppText variant="small" tone="warn">
                    The AI thought it was fine, but the call had warning signs.
                  </AppText>
                ) : null}
              </>
            ) : null}
            <Row gap={8}>
              {detail ? null : (
                <BigButton
                  label="See what the AI heard"
                  tone="ghost"
                  busy={busy}
                  onPress={() => see(c.id)}
                />
              )}
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
            </Row>
          </Card>
        );
      })}
    </View>
  );
}
