import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@core/client/api';
import { formatTime } from '@core/client/format';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import {
  AppText,
  BigButton,
  Card,
  Hero,
  IconCircle,
  ProgressDots,
} from '@core/design-system/components';
import type { IconName } from '@core/design-system/tokens';
import type { VisionFrame } from '@core/ai/vision';
import {
  checkError,
  dateLabelFor,
  greetingFor,
  KIND,
  patientError,
  pickPatientFocus,
  type TodayResponse,
} from './model';
import { PillCamera } from './PillCamera';

const BASE = '/api/reminders';
const Pic = ({ icon }: { icon: IconName }) => (
  <View style={{ alignItems: 'center' }}>
    <IconCircle icon={icon} size={140} tone="primary" />
  </View>
);

/** Patient view: ONE card, ONE primary button. Plain words, no codes. */
export function PatientReminders() {
  const { api, token } = useSession();
  const { data, error, reload } = usePoll(() => api<TodayResponse>('GET', `${BASE}/today`), 2000, [
    token,
  ]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [justId, setJustId] = useState<string | null>(null);
  /** After tapping "I took it" on a pill: the optional "show me" step. */
  const [offer, setOffer] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!justId) return;
    const t = setTimeout(() => setJustId(null), 6000);
    return () => clearTimeout(t);
  }, [justId]);

  /** The tap already counted. Whatever happens to the photos, the patient ends on "thank you". */
  const sendPhotos = async (frames: VisionFrame[]) => {
    const id = offer;
    setCamera(false);
    setOffer(null);
    setNote('');
    if (!id) return;
    try {
      await api('POST', `${BASE}/occurrences/${id}/pill-check`, { frames });
    } catch (e) {
      setNote(checkError(e instanceof ApiError ? e.code : 'offline'));
    }
    setJustId(id);
    reload();
  };

  const run = async (path: string, confirmId?: string, isPill = false) => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      await api('POST', `${BASE}${path}`);
      if (confirmId) setJustId(confirmId);
      if (confirmId && isPill) setOffer(confirmId);
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
        <Pic icon={k.icon} />
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
          onPress={() => run(`/occurrences/${o.id}/confirm`, o.id, o.kind === 'pill')}
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
            Also waiting: {focus.others.map((x) => KIND[x.kind].label).join(', ')}
          </AppText>
        ) : null}
      </Card>
    );
  } else if (focus.kind === 'told') {
    const o = focus.occurrence;
    card = (
      <Card tone="neutral">
        <Pic icon={KIND[o.kind].icon} />
        <AppText variant="title" center>
          That’s okay. Your caregiver has been told.
        </AppText>
        {o.kind === 'pill' ? (
          <AppText center>Please ask them for help with your pill.</AppText>
        ) : (
          <BigButton
            label={KIND[o.kind].done}
            busy={busy}
            onPress={() => run(`/occurrences/${o.id}/confirm`, o.id, o.kind === 'pill')}
          />
        )}
      </Card>
    );
  } else if (focus.kind === 'done') {
    card = (
      <Card tone="success">
        <Pic icon="check" />
        <AppText variant="huge" center tone="success">
          All done. Thank you!
        </AppText>
      </Card>
    );
  } else {
    card = (
      <Card>
        <Pic icon="flower" />
        <AppText variant="title" center>
          Nothing to do right now
        </AppText>
        {focus.next ? (
          <AppText center tone="muted">
            Next: {KIND[focus.next.kind].label} at {at(focus.next.dueAt, focus.next.timeZone)}
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

  if (offer && focus.kind !== 'task') {
    card = camera ? (
      <PillCamera
        onFrames={sendPhotos}
        onSkip={() => {
          setCamera(false);
          setOffer(null);
        }}
      />
    ) : (
      <Card tone="success">
        <Pic icon="check" />
        <AppText variant="huge" center tone="success">
          Thank you!
        </AppText>
        <AppText center>
          One more thing, if you like: show your pill to the camera. It helps your caregiver.
        </AppText>
        <BigButton size="huge" label="Open camera" onPress={() => setCamera(true)} />
        <BigButton tone="ghost" label="No thanks" onPress={() => setOffer(null)} />
      </Card>
    );
  }

  const total = items.filter((o) => o.phase !== 'skipped').length;
  const doneCount = items.filter((o) => o.phase === 'confirmed').length;
  return (
    <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 20 }}>
      <Hero>
        <View style={{ gap: 4 }}>
          <AppText variant="huge" tone="inverse">
            {greetingFor(data.now, items[0]?.timeZone)}
          </AppText>
          <AppText tone="inverseMuted">{dateLabelFor(data.now, items[0]?.timeZone)}</AppText>
        </View>
        {total > 0 ? <ProgressDots inverse done={doneCount} total={total} /> : null}
      </Hero>
      {card}
      {note ? (
        <Card>
          <AppText center>{note}</AppText>
        </Card>
      ) : null}
      {problem ? (
        <Card tone="danger">
          <AppText center>{problem}</AppText>
        </Card>
      ) : null}
      {stale}
    </View>
  );
}
