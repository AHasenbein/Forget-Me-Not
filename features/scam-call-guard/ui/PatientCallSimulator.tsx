import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@core/client/api';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Field } from '@core/design-system/components';
import { patientError, type Warning } from './model';
import { speechSupported, startListening } from './speech';

const BASE = '/api/scam-call-guard';
type Phase = 'idle' | 'starting' | 'recording';
interface Status {
  warning: Warning;
  message: string;
}

/**
 * Patient (proof of concept): ONE button simulates a phone call. While recording, everything said is turned into text
 * and checked; two people talk back and forth near the microphone. Where the browser cannot listen, the same call can
 * be typed line by line. The warning text always comes from the server's fixed copy, never from the AI.
 */
export function PatientCallSimulator() {
  const { api, token } = useSession();
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<Status>({ warning: 'none', message: '' });
  const [problem, setProblem] = useState('');
  const [heard, setHeard] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const call = useRef<{ id: string; seq: number; chain: Promise<void> } | null>(null);
  const listener = useRef<{ stop(): void } | null>(null);
  const canListen = speechSupported();

  const fail = (e: unknown) => setProblem(patientError(e instanceof ApiError ? e.code : 'offline'));

  /** Segments are sent one at a time, in order, so the server sees them as the conversation happened. */
  const send = (text: string) => {
    const c = call.current;
    if (!c || !text.trim()) return;
    setHeard((h) => [...h.slice(-5), text]);
    const seq = c.seq++;
    c.chain = c.chain.then(async () => {
      try {
        const r = await api<{ call: Status }>('POST', `${BASE}/calls/${c.id}/segments`, {
          seq,
          text: text.slice(0, 2000),
        });
        setStatus(r.call);
      } catch (e) {
        fail(e);
      }
    });
  };

  const stop = async () => {
    listener.current?.stop();
    listener.current = null;
    const c = call.current;
    call.current = null;
    setPhase('idle');
    if (!c) return;
    try {
      await c.chain;
      const r = await api<{ call: Status }>('POST', `${BASE}/calls/${c.id}/end`, {});
      setStatus(r.call);
    } catch (e) {
      fail(e);
    }
  };

  const start = async () => {
    setProblem('');
    setHeard([]);
    setStatus({ warning: 'none', message: '' });
    setPhase('starting');
    try {
      const r = await api<{ call: { id: string } }>('POST', `${BASE}/calls`, { consent: true });
      call.current = { id: r.call.id, seq: 0, chain: Promise.resolve() };
      setPhase('recording');
      if (canListen)
        listener.current = startListening(send, (s) => {
          if (s === 'denied')
            setProblem('The microphone is blocked. Please allow it, then try again.');
        });
    } catch (e) {
      setPhase('idle');
      fail(e);
    }
  };

  // Hang up if the person switches account or the screen goes away mid-call.
  useEffect(() => () => void (listener.current?.stop(), (call.current = null)), [token]);

  const recording = phase === 'recording';
  const tone =
    status.warning === 'danger' ? 'danger' : status.warning === 'caution' ? 'warn' : 'neutral';
  return (
    <Card tone={recording ? tone : 'neutral'}>
      <View style={{ gap: 16 }}>
        <AppText variant="title">Phone call</AppText>
        {status.warning !== 'none' ? (
          <AppText bold tone={status.warning === 'danger' ? 'danger' : 'warn'}>
            {status.message}
          </AppText>
        ) : (
          <AppText tone="muted">
            {recording
              ? 'Listening to the call…'
              : 'Press the button, then talk. We will tell you if the call looks like a scam.'}
          </AppText>
        )}
        <BigButton
          label={recording ? 'Stop recording' : 'Start recording'}
          tone={recording ? 'danger' : 'primary'}
          busy={phase === 'starting'}
          onPress={recording ? stop : start}
        />
        {recording && !canListen ? (
          <View style={{ gap: 8 }}>
            <AppText variant="small" tone="muted">
              This browser cannot listen. Type what is said, one line at a time.
            </AppText>
            <Field label="What was said" value={typed} onChangeText={setTyped} />
            <BigButton
              tone="ghost"
              label="Send"
              disabled={!typed.trim()}
              onPress={() => {
                send(typed);
                setTyped('');
              }}
            />
          </View>
        ) : null}
        {heard.length > 0 ? (
          <View style={{ gap: 4 }}>
            {heard.map((h, i) => (
              <AppText key={`${i}-${h}`} variant="small" tone="muted">
                “{h}”
              </AppText>
            ))}
          </View>
        ) : null}
        {problem ? <AppText tone="warn">{problem}</AppText> : null}
      </View>
    </Card>
  );
}
