import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { ApiError } from '@core/client/api';
import { formatTime } from '@core/client/format';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Stack } from '@core/design-system/components';
import { KIND, patientError, pickPatientFocus, type TodayResponse } from './model';

const BASE = '/api/reminders';
const Emoji = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 72, textAlign: 'center' }}>{children}</Text>
);

/** Patient view: ONE card, ONE primary button. Plain words, no codes. */
export function PatientReminders() {
  const { api, persona } = useSession();
  const { data, error, reload } = usePoll(() => api<TodayResponse>('GET', `${BASE}/today`), 2000, [
    persona,
  ]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [justId, setJustId] = useState<string | null>(null);

  useEffect(() => {
    if (!justId) return;
    const t = setTimeout(() => setJustId(null), 6000);
    return () => clearTimeout(t);
  }, [justId]);

  const run = async (path: string, confirmId?: string) => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      await api('POST', `${BASE}${path}`);
      if (confirmId) setJustId(confirmId);
      reload();
    } catch (e) {
      setProblem(patientError(e instanceof ApiError ? e.code : 'offline'));
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <Card>
        <AppText center>{error ? patientError(error.code) : 'One moment…'}</AppText>
      </Card>
    );

  const items = data.occurrences;
  const focus = pickPatientFocus(items, justId);
  const at = (iso: string, tz: string) => formatTime(iso, tz);
  const stale = error ? (
    <AppText variant="small" tone="muted" center>
      I can’t reach the app right now. This may be out of date.
    </AppText>
  ) : null;

  let card;
  if (focus.kind === 'task') {
    const o = focus.occurrence;
    const k = KIND[o.kind];
    card = (
      <Card tone="warn">
        <Emoji>{k.emoji}</Emoji>
        <AppText variant="huge" center>
          {k.task}
        </AppText>
        <AppText center tone="muted">
          {at(o.dueAt, o.timeZone)}
        </AppText>
        <BigButton
          size="huge"
          tone="success"
          label={k.done}
          busy={busy}
          onPress={() => run(`/occurrences/${o.id}/confirm`, o.id)}
        />
        {focus.canSnooze ? (
          <BigButton
            tone="ghost"
            label="Remind me in 10 minutes"
            disabled={busy}
            onPress={() => run(`/occurrences/${o.id}/snooze`)}
          />
        ) : null}
        {focus.others.length ? (
          <AppText variant="small" tone="muted" center>
            Also waiting:{' '}
            {focus.others.map((x) => `${KIND[x.kind].emoji} ${KIND[x.kind].label}`).join(', ')}
          </AppText>
        ) : null}
      </Card>
    );
  } else if (focus.kind === 'told') {
    const o = focus.occurrence;
    card = (
      <Card tone="neutral">
        <Emoji>{KIND[o.kind].emoji}</Emoji>
        <AppText variant="title" center>
          That’s okay. Your caregiver has been told.
        </AppText>
        {o.kind === 'pill' ? (
          <AppText center>Please ask them for help with your pill.</AppText>
        ) : (
          <BigButton
            label={KIND[o.kind].done}
            busy={busy}
            onPress={() => run(`/occurrences/${o.id}/confirm`, o.id)}
          />
        )}
      </Card>
    );
  } else if (focus.kind === 'done') {
    card = (
      <Card tone="success">
        <Emoji>✅</Emoji>
        <AppText variant="huge" center tone="success">
          All done. Thank you!
        </AppText>
      </Card>
    );
  } else {
    card = (
      <Card>
        <Emoji>🌼</Emoji>
        <AppText variant="title" center>
          Nothing to do right now
        </AppText>
        {focus.next ? (
          <AppText center tone="muted">
            Next: {KIND[focus.next.kind].emoji} {KIND[focus.next.kind].label} at{' '}
            {at(focus.next.dueAt, focus.next.timeZone)}
          </AppText>
        ) : (
          <AppText center tone="muted">
            That’s everything for today.
          </AppText>
        )}
        {focus.total ? (
          <AppText variant="small" tone="muted" center>
            {focus.doneCount} of {focus.total} done today
          </AppText>
        ) : null}
      </Card>
    );
  }

  return (
    <Stack>
      {card}
      {problem ? (
        <Card tone="danger">
          <AppText center>{problem}</AppText>
        </Card>
      ) : null}
      {stale}
    </Stack>
  );
}
