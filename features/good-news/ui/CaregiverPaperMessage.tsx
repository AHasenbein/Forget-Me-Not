import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@core/client/api';
import { formatTime } from '@core/client/format';
import { useSession } from '@core/client/session';
import { AppText, Badge, BigButton, Card, Field } from '@core/design-system/components';

const BASE = '/api/good-news/message';
const MAX = 500;

interface MessageView {
  message: { text: string; writtenAt: string; expiresAt: string } | null;
  shownToPatient: boolean;
}

/** Caregiver: the note on the first page of the patient's morning paper. Shown for 24 hours, then it drops off. */
export function CaregiverPaperMessage() {
  const { api, token } = useSession();
  const [view, setView] = useState<MessageView | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    setView(null);
    void api<MessageView>('GET', BASE)
      .then(setView)
      .catch(() => setProblem('Could not load the message.'));
  }, [token]);

  const run = async (fn: () => Promise<MessageView>) => {
    setBusy(true);
    setProblem('');
    try {
      setView(await fn());
      setText('');
    } catch (e) {
      setProblem(
        e instanceof ApiError && e.status === 400
          ? 'Please write 1 to 500 characters.'
          : 'Could not save. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const current = view?.message;
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <AppText variant="title">Morning paper message</AppText>
        <AppText tone="muted" variant="small">
          This is the first page they see when the paper opens. It shows for 24 hours.
        </AppText>
        {current ? (
          <View style={{ gap: 6 }}>
            <Badge
              tone={view?.shownToPatient ? 'success' : 'neutral'}
              label={
                view?.shownToPatient
                  ? `Showing until ${formatTime(current.expiresAt)}`
                  : 'No longer showing'
              }
            />
            <AppText>“{current.text}”</AppText>
          </View>
        ) : (
          <AppText tone="muted">No message right now.</AppText>
        )}
        <Field
          label={current ? 'Write a new message (replaces this one)' : 'Write a message'}
          value={text}
          onChangeText={(t) => setText(t.slice(0, MAX))}
          placeholder="Good morning! I'll visit after lunch."
        />
        <AppText variant="small" tone="muted">
          {text.length}/{MAX}
        </AppText>
        <BigButton
          label="Save message"
          busy={busy}
          disabled={!text.trim()}
          onPress={() => run(() => api<MessageView>('PUT', BASE, { text: text.trim() }))}
        />
        {current ? (
          <BigButton
            tone="ghost"
            label="Remove message"
            busy={busy}
            onPress={() => run(() => api<MessageView>('DELETE', BASE))}
          />
        ) : null}
        {problem ? <AppText tone="warn">{problem}</AppText> : null}
      </View>
    </Card>
  );
}
