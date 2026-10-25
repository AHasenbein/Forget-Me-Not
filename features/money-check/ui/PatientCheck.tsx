import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@core/client/api';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Field, Icon } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { PatientStatus, Reason } from '../schemas';
import { NOTE_MAX, noteReady, patientError, patientReason, patientStatusText } from './model';
import { useRequest } from './useRequest';

const BASE = '/api/money-check';
interface Active {
  request: { id: string; status: PatientStatus; reasons: Reason[] } | null;
}

/**
 * Patient: one calm, outlined button ("Before I pay"). It stays secondary so the screen keeps ONE primary action (the
 * reminder). A short box to type what the payment is for. The patient cannot approve anything: only the caregiver can.
 */
export function PatientCheck() {
  const { api, token } = useSession();
  const { data, reload } = useRequest(() => api<Active>('GET', `${BASE}/requests/active`), [token]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const request = data?.request ?? null;

  const ask = async () => {
    if (busy || !noteReady(note)) return;
    setBusy(true);
    setProblem('');
    try {
      await api('POST', `${BASE}/requests`, { note: note.trim() });
      setNote('');
      setOpen(false);
      reload();
    } catch (e) {
      setProblem(patientError(e instanceof ApiError ? e.code : 'offline'));
    } finally {
      setBusy(false);
    }
  };

  const text = request ? patientStatusText(request.status) : null;
  const why = request && request.status !== 'ok_to_go' ? patientReason(request.reasons) : null;

  return (
    <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 }}>
      {request && text ? (
        <Card
          tone={request.status === 'ok_to_go' || request.status === 'looks_ok' ? 'success' : 'warn'}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Icon
              name={
                request.status === 'ok_to_go' || request.status === 'looks_ok' ? 'check' : 'alert'
              }
              size={44}
              color={
                request.status === 'ok_to_go' || request.status === 'looks_ok'
                  ? palette.success
                  : palette.warn
              }
            />
            <View style={{ flex: 1 }}>
              <AppText variant="title">{text.title}</AppText>
            </View>
          </View>
          <AppText>{text.body}</AppText>
          {why ? <AppText tone="muted">{why}</AppText> : null}
        </Card>
      ) : open ? (
        <Card>
          <AppText variant="title">What is the payment for?</AppText>
          <Field
            label="Type it here"
            value={note}
            onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
            placeholder="For example: the water bill"
          />
          <AppText variant="small" tone="muted">
            Don’t type card numbers or passwords.
          </AppText>
          <BigButton
            label={busy ? 'Checking…' : 'Check'}
            busy={busy}
            disabled={!noteReady(note)}
            onPress={ask}
          />
          <BigButton tone="ghost" label="Never mind" onPress={() => setOpen(false)} />
        </Card>
      ) : (
        <BigButton tone="ghost" label="Before I pay" onPress={() => setOpen(true)} />
      )}
      {problem ? (
        <Card tone="danger">
          <AppText center>{problem}</AppText>
        </Card>
      ) : null}
    </View>
  );
}
