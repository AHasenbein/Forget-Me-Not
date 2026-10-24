import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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
  IconCircle,
  Row,
  Segmented,
  Stack,
  StatTile,
} from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { ReminderKind, Schedule } from '../schemas';
import { REMINDER_KINDS } from '../schemas';
import {
  caregiverCounts,
  caregiverError,
  caregiverRows,
  type CaregiverRow,
  dateLabelFor,
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
  const [section, setSection] = useState<Section>('today');
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

  const allClear = !today.error && counts.attention === 0 && reviews.length === 0;

  return (
    <Stack>
      <Stack gap={4}>
        <AppText variant="huge">Today</AppText>
        <AppText tone="muted">{today.data ? dateLabelFor(today.data.now, tz) : ' '}</AppText>
      </Stack>

      {today.error && !today.data ? (
        <Card tone="danger">
          <AppText>{caregiverError(today.error.code)}</AppText>
        </Card>
      ) : (
        <Card tone={allClear ? 'success' : 'warn'}>
          <Row gap={14}>
            <IconCircle
              emoji={allClear ? '✅' : '⚠️'}
              size={64}
              tone={allClear ? 'success' : 'warn'}
            />
            <View style={{ flex: 1, minWidth: 200 }}>
              <AppText variant="title" tone={allClear ? 'success' : 'warn'}>
                {allClear ? 'All on track' : `${counts.attention + reviews.length} to look at`}
              </AppText>
              <AppText variant="small" tone="muted">
                {history.data
                  ? `Last ${history.data.days} days: ${history.data.summary.confirmed} done, ${history.data.summary.missed} missed, ${history.data.summary.skipped} skipped`
                  : 'Checking in…'}
              </AppText>
            </View>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile value={counts.done} label="done" tone="success" />
            <StatTile value={counts.upcoming} label="coming up" />
            <StatTile
              value={counts.attention}
              label="need attention"
              tone={counts.attention ? 'danger' : 'neutral'}
            />
          </View>
        </Card>
      )}

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
          <Row gap={14}>
            <IconCircle emoji={KIND[r.occurrence.kind].emoji} size={56} tone="danger" />
            <View style={{ flex: 1, minWidth: 180 }}>
              <AppText variant="title" tone="danger">
                {KIND[r.occurrence.kind].label} missed
              </AppText>
              <AppText variant="small" tone="muted">
                Due {formatTime(r.occurrence.dueAt, r.occurrence.timeZone)}
              </AppText>
            </View>
          </Row>
          <AppText>
            They haven’t confirmed.{' '}
            {r.occurrence.kind === 'pill'
              ? 'Only mark it done if you gave it to them yourself.'
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

      <Segmented options={SECTIONS} value={section} onChange={setSection} />

      {section === 'today' ? (
        <Card>
          {rows.length === 0 ? <AppText tone="muted">Nothing scheduled for today.</AppText> : null}
          {rows.map((r, i) => (
            <View key={r.occurrence.id} style={[styles.rowItem, i > 0 && styles.rowDivider]}>
              <IconCircle emoji={KIND[r.occurrence.kind].emoji} size={48} tone={r.tone} />
              <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
                <AppText bold>{KIND[r.occurrence.kind].label}</AppText>
                <Row gap={6}>
                  <Badge label={r.status} tone={r.tone} />
                  {r.check ? <Badge label={r.check.label} tone={r.check.tone} /> : null}
                </Row>
              </View>
              {r.canMarkDone && !r.needsAttention ? (
                <Chip label="Mark done" onPress={() => void markDone(r.occurrence)} />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {section === 'schedules' ? (
        <Card>
          {list.length === 0 ? <AppText tone="muted">No reminders set up yet.</AppText> : null}
          {list.map((s, i) => (
            <View key={s.id} style={[{ gap: 10 }, i > 0 && styles.rowDivider]}>
              <View style={styles.rowItem}>
                <IconCircle emoji={KIND[s.kind].emoji} size={48} />
                <View style={{ flex: 1, minWidth: 140 }}>
                  <AppText bold>
                    {KIND[s.kind].label} · {formatTime(`2026-01-01T${s.localTime}:00Z`, 'UTC')}
                  </AppText>
                  <AppText variant="small" tone="muted">
                    {daysLabel(s.daysOfWeek)}
                  </AppText>
                </View>
                {s.paused ? <Badge label="Paused" tone="warn" /> : null}
              </View>
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
            </View>
          ))}
        </Card>
      ) : null}

      {section === 'add' ? (
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
            placeholder="e.g. 8:30"
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
              setSection('schedules');
            }}
          />
          <AppText variant="small" tone="muted">
            Repeats every day · time zone {tz}
          </AppText>
        </Card>
      ) : null}

      {problem ? (
        <Card tone="danger">
          <AppText>{problem}</AppText>
        </Card>
      ) : null}
    </Stack>
  );
}

const SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'add', label: 'Add new' },
] as const;
type Section = (typeof SECTIONS)[number]['id'];

const styles = StyleSheet.create({
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  rowDivider: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 16 },
});

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
          ? 'The photos do not seem to show them taking the pill. They tapped “I took it”, so it counts as taken until you decide.'
          : 'The check could not tell. They tapped “I took it”, so it counts as taken. Look at the photos if you want to be sure.'}
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
