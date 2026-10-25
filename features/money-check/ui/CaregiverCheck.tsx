import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@core/client/api';
import { formatTime } from '@core/client/format';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { BankTransaction } from '@core/providers/types';
import type { MoneyRequest } from '../schemas';
import {
  ARM_MS,
  caregiverError,
  clearedLine,
  caregiverReason,
  dollars,
  kindLabel,
  levelTitle,
  levelTone,
} from './model';
import { useRequest } from './useRequest';

const BASE = '/api/money-check';
interface Active {
  request: MoneyRequest | null;
  bill: BankTransaction | null;
  cleared?: { note: string | null; at: string }[];
}

/** Caregiver: renders NOTHING until the patient asks. Then the verdict, the reasons, and two buttons. */
export function CaregiverCheck() {
  const { api, token } = useSession();
  const { data, reload } = useRequest(() => api<Active>('GET', `${BASE}/requests/active`), [token]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [armed, setArmed] = useState(false);
  const r = data?.request ?? null;
  // "Tap again" expires, so a stray later tap cannot approve a payment.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  if (!r) {
    const cleared = data?.cleared ?? [];
    if (cleared.length === 0) return null;
    return (
      <Card>
        <AppText variant="small" bold>
          Payments the check let through
        </AppText>
        {cleared.map((c) => (
          <AppText key={c.at} variant="small" tone="muted">
            {clearedLine(c, formatTime)}
          </AppText>
        ))}
      </Card>
    );
  }

  const decide = async (decision: 'approve' | 'decline') => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      await api('POST', `${BASE}/requests/${r.id}/decide`, { decision });
    } catch (e) {
      setProblem(caregiverError(e instanceof ApiError ? e.code : 'offline'));
    } finally {
      setBusy(false);
      reload();
    }
  };
  const bill = data?.bill ?? null;
  const tone = levelTone(r.level);

  return (
    <Card tone={tone}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="alert" size={40} color={palette[tone]} />
        <View style={{ flex: 1 }}>
          <AppText variant="title" tone={tone}>
            {levelTitle(r.level)}
          </AppText>
          <AppText variant="small" tone="muted">
            {kindLabel(r.kind)} · asked at {formatTime(r.createdAt)}
          </AppText>
        </View>
      </View>
      {r.note ? (
        <View style={{ gap: 2 }}>
          <AppText variant="small" tone="muted">
            They wrote:
          </AppText>
          <AppText>“{r.note}”</AppText>
          <AppText variant="small" tone="muted">
            {r.aiChecked
              ? 'An AI also looked at this.'
              : 'The AI check was not available, so only simple rules were used.'}
          </AppText>
        </View>
      ) : null}
      {bill ? (
        <AppText>
          {bill.payee}, {dollars(bill.amountCents)}
          {bill.dueDate ? `, due ${bill.dueDate}` : ''}
        </AppText>
      ) : null}
      {r.reasons.map((x) => (
        <AppText key={x}>{caregiverReason(x)}</AppText>
      ))}
      <AppText variant="small" tone="muted">
        If you do not answer by {formatTime(r.expiresAt)}, this is declined and they are told not to
        pay. Nothing is paid by this app.
      </AppText>
      <BigButton tone="danger" label="Don’t pay" busy={busy} onPress={() => decide('decline')} />
      <BigButton
        tone={armed ? 'success' : 'ghost'}
        label={armed ? 'Tap again: it’s OK to pay' : 'It’s OK to pay'}
        busy={busy}
        onPress={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          return decide('approve');
        }}
      />
      {problem ? <AppText tone="danger">{problem}</AppText> : null}
    </Card>
  );
}
