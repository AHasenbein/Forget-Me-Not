import { useState } from 'react';
import { Image, View } from 'react-native';
import { ApiError } from '@core/client/api';
import { daysLabel, formatTime } from '@core/client/format';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import {
  AppText,
  Badge,
  BigButton,
  Card,
  Chip,
  Field,
  Row,
  Stack,
} from '@core/design-system/components';
import type { ReminderKind, Schedule } from '../schemas';
import { REMINDER_KINDS } from '../schemas';
import {
  caregiverCounts,
  caregiverError,
  caregiverRows,
  type CaregiverRow,
  KIND,
  normalizeTime,
  type OccurrenceView,
  type TodayResponse,
} from './model';

const BASE = '/api/reminders';
interface PhotoSet {
  frames: { mediaType: string; data: string }[];
}
interface History {
  days: number;
  summary: { confirmed: number; missed: number; skipped: number };
}

export function CaregiverReminders() {
  const { api, token } = useSession();
  const today = usePoll(() => api<TodayResponse>('GET', `${BASE}/today`), 2000, [token]);
  const schedules = usePoll(() => api<Schedule[]>('GET', `${BASE}/schedules`), 4000, [token]);
  const history = usePoll(() => api<History>('GET', `${BASE}/history?days=7`), 8000, [token]);
  const [problem, setProblem] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [kind, setKind] = useState<ReminderKind>('pill');
  const [time, setTime] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, PhotoSet>>({});

  const refresh = () => {
    today.reload();
    schedules.reload();
    history.reload();
  };
  const call = async (id: string, method: string, path: string, body?: unknown) => {
    if (busyId) return;
    setBusyId(id);
    setProblem('');
    try {
      await api(method, `${BASE}${path}`, body);
      refresh();
    } catch (e) {
      setProblem(caregiverError(e instanceof ApiError ? e.code : 'offline'));
    } finally {
      setBusyId(null);
    }
  };

  const rows = caregiverRows(today.data?.occurrences ?? [], formatTime);
  const counts = caregiverCounts(rows);
  const attention = rows.filter((r) => r.needsAttention);
  const list: Schedule[] = schedules.data ?? [];
  const tz = list[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hhmm = normalizeTime(time);

  const markDone = (o: OccurrenceView) => call(o.id, 'POST', `/occurrences/${o.id}/confirm`);
  const reviews = rows.filter((r) => r.needsReview);
  const viewPhotos = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setProblem('');
    try {
      const got = await api<PhotoSet>('GET', `${BASE}/occurrences/${id}/frames`);
      setPhotos((p) => ({ ...p, [id]: got }));
    } catch (e) {
      setProblem(caregiverError(e instanceof ApiError ? e.code : 'offline'));
    } finally {
      setBusyId(null);
    }
  };
  const review = async (id: string, decision: 'approve' | 'reject') => {
    await call(id, 'POST', `/occurrences/${id}/review`, { decision });
    setPhotos((p) => {
      const { [id]: _gone, ...rest } = p;
      return rest;
    });
  };

  return (
    <Stack>
      <Card>
        <AppText variant="title">Reminders today</AppText>
        {today.error && !today.data ? (
          <AppText tone="danger">{caregiverError(today.error.code)}</AppText>
        ) : (
          <Row gap={8}>
            <Badge label={`${counts.done} done`} tone="success" />
            <Badge label={`${counts.upcoming} coming up`} tone="neutral" />
            <Badge
              label={`${counts.attention} need attention`}
              tone={counts.attention ? 'danger' : 'neutral'}
            />
          </Row>
        )}
        {history.data ? (
          <AppText variant="small" tone="muted">
            Last {history.data.days} days: {history.data.summary.confirmed} done,{' '}
            {history.data.summary.missed} missed, {history.data.summary.skipped} skipped
          </AppText>
        ) : null}
      </Card>

      {reviews.map((r) => (
        <ReviewCard
          key={r.occurrence.id}
          row={r}
          photos={photos[r.occurrence.id]}
          busy={busyId === r.occurrence.id}
          onView={() => viewPhotos(r.occurrence.id)}
          onDecide={(d) => review(r.occurrence.id, d)}
        />
      ))}

      {attention.map((r) => (
        <Card key={r.occurrence.id} tone="danger">
          <AppText variant="title" tone="danger">
            {KIND[r.occurrence.kind].emoji} {KIND[r.occurrence.kind].label} missed
          </AppText>
          <AppText>
            Due {formatTime(r.occurrence.dueAt, r.occurrence.timeZone)}. Margaret hasn’t confirmed.{' '}
            {r.occurrence.kind === 'pill'
              ? 'Only mark it done if you gave it to her yourself.'
              : ''}
          </AppText>
          <BigButton
            tone="primary"
            label={r.occurrence.kind === 'pill' ? 'I gave it' : 'Mark done'}
            busy={busyId === r.occurrence.id}
            disabled={!!busyId}
            onPress={() => markDone(r.occurrence)}
          />
        </Card>
      ))}

      <Card>
        {rows.length === 0 ? <AppText tone="muted">Nothing scheduled for today.</AppText> : null}
        {rows.map((r) => (
          <Row key={r.occurrence.id} gap={10}>
            <AppText>{KIND[r.occurrence.kind].emoji}</AppText>
            <AppText bold>{KIND[r.occurrence.kind].label}</AppText>
            <Badge label={r.status} tone={r.tone} />
            {r.check ? <Badge label={r.check.label} tone={r.check.tone} /> : null}
            {r.canMarkDone && !r.needsAttention ? (
              <Chip label="Mark done" onPress={() => void markDone(r.occurrence)} />
            ) : null}
          </Row>
        ))}
      </Card>

      <Card>
        <AppText variant="title">Schedules</AppText>
        {list.length === 0 ? <AppText tone="muted">No reminders set up yet.</AppText> : null}
        {list.map((s) => (
          <Stack key={s.id} gap={8}>
            <Row gap={10}>
              <AppText>{KIND[s.kind].emoji}</AppText>
              <AppText bold>
                {KIND[s.kind].label} · {formatTime(`2026-01-01T${s.localTime}:00Z`, 'UTC')}
              </AppText>
              <AppText variant="small" tone="muted">
                {daysLabel(s.daysOfWeek)}
              </AppText>
              {s.paused ? <Badge label="Paused" tone="warn" /> : null}
            </Row>
            <Row gap={8}>
              <Chip
                label={s.paused ? 'Resume' : 'Pause'}
                onPress={() =>
                  void call(s.id, 'PATCH', `/schedules/${s.id}`, { paused: !s.paused })
                }
              />
              <Chip
                label={confirmDelete === s.id ? 'Tap again to delete' : 'Delete'}
                selected={confirmDelete === s.id}
                onPress={() => {
                  if (confirmDelete !== s.id) return setConfirmDelete(s.id);
                  setConfirmDelete(null);
                  void call(s.id, 'DELETE', `/schedules/${s.id}`);
                }}
              />
            </Row>
          </Stack>
        ))}
      </Card>

      <Card>
        <AppText variant="title">Add a reminder</AppText>
        <Row gap={8}>
          {REMINDER_KINDS.map((k) => (
            <Chip
              key={k}
              label={`${KIND[k].emoji} ${KIND[k].label}`}
              selected={k === kind}
              onPress={() => setKind(k)}
            />
          ))}
        </Row>
        <Field
          label="Time (e.g. 8:30 or 20:00)"
          value={time}
          onChangeText={setTime}
          placeholder="08:00"
        />
        {time && !hhmm ? (
          <AppText variant="small" tone="danger">
            That doesn’t look like a time.
          </AppText>
        ) : null}
        <BigButton
          label="Add reminder"
          disabled={!hhmm || !!busyId}
          busy={busyId === 'new'}
          onPress={async () => {
            await call('new', 'POST', '/schedules', { kind, localTime: hhmm, timeZone: tz });
            setTime('');
          }}
        />
        <AppText variant="small" tone="muted">
          Repeats every day · time zone {tz}
        </AppText>
      </Card>

      {problem ? (
        <Card tone="danger">
          <AppText>{problem}</AppText>
        </Card>
      ) : null}
    </Stack>
  );
}

function ReviewCard({
  row,
  photos,
  busy,
  onView,
  onDecide,
}: {
  row: CaregiverRow;
  photos?: PhotoSet;
  busy: boolean;
  onView: () => void;
  onDecide: (d: 'approve' | 'reject') => void;
}) {
  const wrong = row.occurrence.confirmation?.verification === 'rejected';
  return (
    <Card tone={wrong ? 'danger' : 'warn'}>
      <AppText variant="title" tone={wrong ? 'danger' : 'warn'}>
        💊 {wrong ? 'The pill photos look wrong' : 'The pill photos were unclear'}
      </AppText>
      <AppText>
        {wrong
          ? 'The photos do not seem to show Margaret taking her pill. She tapped “I took it”, so it counts as taken until you decide.'
          : 'The check could not tell. She tapped “I took it”, so it counts as taken. Look at the photos if you want to be sure.'}
      </AppText>
      {photos ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.frames.map((f, i) => (
            <Image
              key={i}
              accessibilityLabel={`Photo ${i + 1}`}
              source={{ uri: `data:${f.mediaType};base64,${f.data}` }}
              style={{ width: 140, height: 105, borderRadius: 8, backgroundColor: '#ddd' }}
            />
          ))}
        </View>
      ) : (
        <BigButton tone="ghost" label="View photos" busy={busy} onPress={onView} />
      )}
      <BigButton label="Looks fine" disabled={busy} onPress={() => onDecide('approve')} />
      <BigButton
        tone="danger"
        label="Not right"
        disabled={busy}
        onPress={() => onDecide('reject')}
      />
      <AppText variant="small" tone="muted">
        Photos are deleted when you approve, or after 7 days. Every time you view them is recorded.
      </AppText>
    </Card>
  );
}
