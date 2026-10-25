import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@core/client/api';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { PatientStatus } from '../schemas';
import { patientError, patientStatusText } from './model';
import { useActive } from './useActive';

const BASE = '/api/lost-button';
interface Active {
  alert: { id: string; status: PatientStatus; since: string } | null;
}

/**
 * Patient: one calm, outlined button under the reminders (it stays secondary so the screen keeps ONE primary
 * action). One tap sends the alert; the patient cannot cancel it, only the caregiver closes it.
 */
export function PatientLost() {
  const { api, token } = useSession();
  const { data, reload } = useActive(() => api<Active>('GET', `${BASE}/alerts/active`), [token]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const alert = data?.alert ?? null;

  const press = async () => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      await api('POST', `${BASE}/alerts`, {}); // the route's input schema is a strict empty object
      reload();
    } catch (e) {
      setProblem(patientError(e instanceof ApiError ? e.code : 'offline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 }}>
      {alert ? (
        <Card tone="primary">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Icon
              name={alert.status === 'no_one_reachable' ? 'alert' : 'check'}
              size={44}
              color={palette.primary}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="title">{patientStatusText(alert.status).title}</AppText>
            </View>
          </View>
          <AppText>{patientStatusText(alert.status).body}</AppText>
        </Card>
      ) : (
        <BigButton tone="ghost" label="I’m lost" busy={busy} onPress={press} />
      )}
      {!alert ? (
        <AppText variant="small" tone="muted" center>
          Tap if you need help. Your caregiver will be told.
        </AppText>
      ) : null}
      {problem ? (
        <Card tone="danger">
          <AppText center>{problem}</AppText>
        </Card>
      ) : null}
    </View>
  );
}
