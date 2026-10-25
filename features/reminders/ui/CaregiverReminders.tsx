import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ApiError } from '@core/client/api';
import { useAttention } from '@core/client/attention';
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
} from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import type { ReminderKind, Schedule } from '../schemas';
import { LABEL_MAX, REMINDER_KINDS } from '../schemas';
import {
  caregiverCounts,
  caregiverError,
  caregiverRows,
  type CaregiverRow,
  adherencePercent,
  attentionReport,
  auditLabel,
  photoWorthKnowing,
  dateLabelFor,
  type DayBar,
  nextUp,
  untilLabel,
  weekStrip,
  KIND,
  labelOf,
  normalizeTime,
  type OccurrenceView,
  type TodayResponse,
} from './model';

const BASE = '/api/reminders';
interface PhotoSet {
  frames: { mediaType: string; data: string }[];
}
interface AuditRow {
  id: string;
  at: string;
  action: string;
  byYou?: boolean;
}
interface History {
  occurrences: OccurrenceView[];
  days: number;
  summary: { confirmed: number; missed: number; skipped: number };
}

/**
 * The caregiver reminders UI is six small dashboard widgets (one per page section) instead of one big widget with
 * its own tabs: alerts, summary strip, today, manage, week graph, and the pill-photo lines of "Worth knowing". Each polls only what it shows.
 */

/** One request at a time, then refresh; errors in plain words. */
function useCaller(refresh: () => void) {
  const { api } = useSession();
  const [problem, setProblem] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** True when the request went through. */
  const call = async (id: string, method: string, path: string, body?: unknown) => {
    if (busyId) return false;
    setBusyId(id);
    setProblem('');
    try {
      await api(method, `${BASE}${path}`, body);
      refresh();
      return true;
    } catch (e) {
      setProblem(caregiverError(e instanceof ApiError ? e.code : 'offline'));
      return false;
    } finally {
      setBusyId(null);
    }
  };
  return { call, problem, setProblem, busyId };
}

function Problem({ text }: { text: string }) {
  return text ? (
    <Card tone="danger">
      <AppText>{text}</AppText>
    </Card>
  ) : null;
}

/** Alerts: pill photos to review and missed reminders. Renders nothing when all is well. */
export function RemindersAttention() {
  const { api, token } = useSession();
  const today = usePoll(() => api<TodayResponse>('GET', `${BASE}/today`), 2000, [token]);
  const { call, problem, setProblem, busyId } = useCaller(() => today.reload());
  const [photos, setPhotos] = useState<Record<string, PhotoSet>>({});
  const rows = caregiverRows(today.data?.occurrences ?? [], formatTime);
  const attention = rows.filter((r) => r.needsAttention);
  const reviews = rows.filter((r) => r.needsReview);
  useAttention(!today.data && !today.error ? null : attentionReport(rows, today.error !== null));
  const markDone = (o: OccurrenceView) => call(o.id, 'POST', `/occurrences/${o.id}/confirm`);
  const viewPhotos = async (id: string) => {
    if (busyId) return;
    setProblem('');
    try {
      const got = await api<PhotoSet>('GET', `${BASE}/occurrences/${id}/frames`);
      setPhotos((p) => ({ ...p, [id]: got }));
    } catch (e) {
      setProblem(caregiverError(e instanceof ApiError ? e.code : 'offline'));
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
    <>
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

      {attention.length ? (
        <Card tone="danger">
          <AppText variant="title" tone="danger">
            {attention.length === 1 ? '1 reminder missed' : `${attention.length} reminders missed`}
          </AppText>
          <AppText variant="small" tone="muted">
            They haven’t confirmed. Only mark a pill done if you gave it to them yourself.
          </AppText>
          {attention.map((r, i) => (
            <View key={r.occurrence.id} style={[styles.rowItem, i > 0 && styles.rowDivider]}>
              <IconCircle icon={KIND[r.occurrence.kind].icon} size={30} tone="danger" />
              <View style={{ flex: 1, minWidth: 100 }}>
                <AppText bold>{labelOf(r.occurrence)}</AppText>
                <AppText variant="small" tone="muted">
                  Due {formatTime(r.occurrence.dueAt, r.occurrence.timeZone)}
                </AppText>
              </View>
              <Chip
                label={r.occurrence.kind === 'pill' ? 'I gave it' : 'Mark done'}
                onPress={() => void markDone(r.occurrence)}
              />
            </View>
          ))}
        </Card>
      ) : null}
      <Problem text={problem} />
    </>
  );
}

/** One number in the stats strip. */
function Stat({
  value,
  label,
  tone = 'neutral',
}: {
  value: string | number;
  label: string;
  tone?: 'neutral' | 'danger' | 'success' | 'warn' | 'primary';
}) {
  return (
    <View style={styles.stat}>
      <AppText variant="huge" tone={tone === 'neutral' ? undefined : tone}>
        {String(value)}
      </AppText>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

/**
 * Stats strip under "needs you now": how today's reminders are going, at a glance. The overall "is everything OK"
 * answer is the dashboard's status line, so this strip only covers reminders.
 */
export function RemindersSummary() {
  const { api, token } = useSession();
  const today = usePoll(() => api<TodayResponse>('GET', `${BASE}/today`), 2000, [token]);
  const history = usePoll(() => api<History>('GET', `${BASE}/history?days=7`), 8000, [token]);
  const schedules = usePoll(() => api<Schedule[]>('GET', `${BASE}/schedules`), 8000, [token]);
  const rows = caregiverRows(today.data?.occurrences ?? [], formatTime);
  const counts = caregiverCounts(rows);
  const tz = schedules.data?.[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nextItem = nextUp(today.data?.occurrences ?? []);
  const pct = history.data ? adherencePercent(history.data.summary) : null;
  if (today.error && !today.data)
    return (
      <Card tone="danger">
        <AppText>{caregiverError(today.error.code)}</AppText>
      </Card>
    );
  return (
    <View style={styles.strip}>
      <View style={[styles.stat, styles.statWide]}>
        <AppText variant="title">
          {today.data ? dateLabelFor(today.data.now, tz) : 'Checking in…'}
        </AppText>
        <AppText variant="small" tone="muted">
          Today’s reminders
        </AppText>
      </View>
      <Stat value={counts.done} label="done today" tone="success" />
      <Stat value={counts.upcoming} label="coming up" />
      <Stat
        value={counts.attention}
        label="missed"
        tone={counts.attention ? 'danger' : 'neutral'}
      />
      <Stat
        value={pct === null ? '–' : `${pct}%`}
        label="taken this week"
        tone={pct !== null && pct < 70 ? 'warn' : 'primary'}
      />
      <View style={[styles.stat, styles.statWide]}>
        <AppText variant="title">
          {nextItem && today.data ? labelOf(nextItem) : 'Nothing next'}
        </AppText>
        <AppText variant="small" tone="muted">
          {nextItem && today.data
            ? `${untilLabel(today.data.now, nextItem.dueAt)} (${formatTime(nextItem.dueAt, nextItem.timeZone)})`
            : 'next reminder'}
        </AppText>
      </View>
    </View>
  );
}

/** Today panel: today's reminders. */
export function RemindersToday() {
  const { api, token } = useSession();
  const today = usePoll(() => api<TodayResponse>('GET', `${BASE}/today`), 2000, [token]);
  const { call, problem } = useCaller(() => today.reload());
  const rows = caregiverRows(today.data?.occurrences ?? [], formatTime);
  return (
    <>
      <Card>
        <AppText variant="title">Today</AppText>
        {rows.length === 0 ? <AppText tone="muted">Nothing scheduled for today.</AppText> : null}
        {rows.map((r, i) => (
          <View key={r.occurrence.id} style={[styles.rowItem, i > 0 && styles.rowDivider]}>
            <IconCircle icon={KIND[r.occurrence.kind].icon} size={30} tone={r.tone} />
            <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
              <AppText bold>{labelOf(r.occurrence)}</AppText>
              {r.occurrence.snoozeCount ? (
                <AppText variant="small" tone="muted">
                  Snoozed {r.occurrence.snoozeCount}×
                </AppText>
              ) : null}
              <Row gap={6}>
                <Badge label={r.status} tone={r.tone} />
                {r.check ? <Badge label={r.check.label} tone={r.check.tone} /> : null}
              </Row>
            </View>
            {r.canMarkDone && !r.needsAttention ? (
              <Chip
                label="Mark done"
                onPress={() =>
                  void call(r.occurrence.id, 'POST', `/occurrences/${r.occurrence.id}/confirm`)
                }
              />
            ) : null}
          </View>
        ))}
      </Card>
      <Problem text={problem} />
    </>
  );
}

/** Reminders panel: the schedules (pause / delete) and the add form. */
export function RemindersManage() {
  const { api, token } = useSession();
  const schedules = usePoll(() => api<Schedule[]>('GET', `${BASE}/schedules`), 4000, [token]);
  const { call, problem, busyId } = useCaller(() => schedules.reload());
  const [kind, setKind] = useState<ReminderKind>('pill');
  const [time, setTime] = useState('');
  const [words, setWords] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const list: Schedule[] = schedules.data ?? [];
  const tz = list[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hhmm = normalizeTime(time);
  const custom = kind === 'custom';
  const wordsOk = !custom || words.trim().length >= 2;
  const close = () => {
    setAdding(false);
    setTime('');
    setWords('');
  };
  return (
    <>
      <Card>
        <AppText variant="title">Reminders</AppText>
        {list.length === 0 ? <AppText tone="muted">No reminders set up yet.</AppText> : null}
        {list.map((s, i) => (
          <View key={s.id} style={[styles.rowItem, i > 0 && styles.rowDivider]}>
            <IconCircle icon={KIND[s.kind].icon} size={30} />
            <View style={{ flex: 1, minWidth: 110 }}>
              <AppText bold>
                {labelOf(s)} · {formatTime(`2026-01-01T${s.localTime}:00Z`, 'UTC')}
              </AppText>
              <AppText variant="small" tone="muted">
                {s.paused ? 'Paused · ' : ''}
                {daysLabel(s.daysOfWeek)}
              </AppText>
            </View>
            <Chip
              label={s.paused ? 'Resume' : 'Pause'}
              onPress={() => void call(s.id, 'PATCH', `/schedules/${s.id}`, { paused: !s.paused })}
            />
            <Chip
              label={confirmDelete === s.id ? 'Tap again' : 'Delete'}
              selected={confirmDelete === s.id}
              onPress={() => {
                if (confirmDelete !== s.id) return setConfirmDelete(s.id);
                setConfirmDelete(null);
                void call(s.id, 'DELETE', `/schedules/${s.id}`);
              }}
            />
          </View>
        ))}
        {/* The add form stays folded until asked for: it is used rarely and the list is what you scan. */}
        {adding ? (
          <View style={[styles.rowDivider, { gap: 10 }]}>
            <AppText bold>Add a reminder</AppText>
            <Row gap={8}>
              {REMINDER_KINDS.map((k) => (
                <Chip
                  key={k}
                  label={KIND[k].label}
                  selected={k === kind}
                  onPress={() => setKind(k)}
                />
              ))}
            </Row>
            {custom ? (
              <>
                <Field
                  label={`What should we remind them? (up to ${LABEL_MAX} letters)`}
                  value={words}
                  onChangeText={(t) => setWords(t.slice(0, LABEL_MAX))}
                  placeholder="e.g. Water the plants"
                />
                <AppText variant="small" tone="muted">
                  Shown on their screen in big letters. Keep it short and plain; their phone’s
                  notification only says “Time for your reminder”.
                </AppText>
              </>
            ) : null}
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
            <Row gap={8}>
              <BigButton
                label="Add reminder"
                disabled={!hhmm || !wordsOk || !!busyId}
                busy={busyId === 'new'}
                onPress={async () => {
                  const ok = await call('new', 'POST', '/schedules', {
                    kind,
                    ...(custom ? { label: words.trim() } : {}),
                    localTime: hhmm,
                    timeZone: tz,
                  });
                  if (ok) close(); // on a problem the form stays open with what they typed
                }}
              />
              <BigButton tone="ghost" label="Cancel" onPress={close} />
            </Row>
            <AppText variant="small" tone="muted">
              Repeats every day · time zone {tz}
            </AppText>
          </View>
        ) : (
          <BigButton tone="ghost" label="Add a reminder" onPress={() => setAdding(true)} />
        )}
      </Card>
      <Problem text={problem} />
    </>
  );
}

/** Week: the 7-day graph. */
export function RemindersWeek() {
  const { api, token } = useSession();
  const today = usePoll(() => api<TodayResponse>('GET', `${BASE}/today`), 4000, [token]);
  const history = usePoll(() => api<History>('GET', `${BASE}/history?days=7`), 8000, [token]);
  const schedules = usePoll(() => api<Schedule[]>('GET', `${BASE}/schedules`), 8000, [token]);
  const tz = schedules.data?.[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const week = history.data
    ? weekStrip(history.data.occurrences, today.data?.now ?? new Date().toISOString(), tz)
    : null;
  const pct = history.data ? adherencePercent(history.data.summary) : null;
  return week ? <WeekCard week={week} pct={pct} /> : null;
}

/** Activity: who looked at what (the audit log). Folded by default: it is for checking, not for every glance. */
/**
 * "Worth knowing" box (activity section): only what ANOTHER caregiver did with pill photos. Every view and review is
 * still recorded; the full record is one tap away. The shell supplies the box and its heading.
 */
export function RemindersActivity() {
  const { api, token } = useSession();
  const audit = usePoll(() => api<AuditRow[]>('GET', `${BASE}/audit`), 10000, [token]);
  const [open, setOpen] = useState(false);
  const rows = audit.data ?? [];
  const items = photoWorthKnowing(rows);
  return (
    <View style={{ gap: 6 }}>
      {!audit.data ? (
        <AppText tone={audit.error ? 'warn' : 'muted'}>
          {audit.error ? 'Can’t check the pill photo record right now.' : 'Checking pill photos…'}
        </AppText>
      ) : items.length === 0 ? (
        <AppText tone="muted">Pill photos: no one else opened them.</AppText>
      ) : (
        items.map((n) => (
          <AppText key={n.action}>
            {`${n.text}${n.count > 1 ? ` (${n.count} times)` : ''}. Last: ${formatTime(n.lastAt)}.`}
          </AppText>
        ))
      )}
      {rows.length ? (
        <Row gap={8}>
          <Chip
            label={open ? 'Hide pill photo record' : 'Full pill photo record'}
            selected={open}
            onPress={() => setOpen((o) => !o)}
          />
        </Row>
      ) : null}
      {(open ? rows : []).map((a, i) => (
        <View key={a.id} style={[styles.rowItem, i > 0 && styles.rowDivider]}>
          <IconCircle icon={a.action === 'pill_frames_viewed' ? 'camera' : 'check'} size={30} />
          <View style={{ flex: 1, minWidth: 140 }}>
            <AppText>{a.byYou ? `${auditLabel(a.action)} (you)` : auditLabel(a.action)}</AppText>
            <AppText variant="small" tone="muted">
              {formatTime(a.at)}
            </AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' },
  stat: {
    flexGrow: 1,
    flexBasis: 110,
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    justifyContent: 'center',
  },
  statWide: { flexBasis: 200, flexGrow: 2 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  rowDivider: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
});

function WeekCard({ week, pct }: { week: DayBar[]; pct: number | null }) {
  const max = Math.max(1, ...week.map((d) => d.done + d.missed));
  const H = 84;
  return (
    <Card>
      <Row gap={12}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <AppText variant="title">This week</AppText>
          <AppText variant="small" tone="muted">
            Reminders taken over the last 7 days
          </AppText>
        </View>
        <AppText
          variant={pct === null ? 'small' : 'huge'}
          tone={pct !== null && pct < 70 ? 'warn' : 'primary'}
        >
          {pct === null ? 'No data yet' : `${pct}%`}
        </AppText>
      </Row>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {week.map((d) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View
              accessible
              accessibilityLabel={`${d.label}: ${d.done} done, ${d.missed} missed`}
              style={{
                width: '100%',
                height: H,
                justifyContent: 'flex-end',
                borderRadius: 3,
                backgroundColor: palette.sunken,
                overflow: 'hidden',
              }}
            >
              {d.missed ? (
                <View style={{ height: (d.missed / max) * H, backgroundColor: palette.danger }} />
              ) : null}
              {d.done ? (
                <View style={{ height: (d.done / max) * H, backgroundColor: palette.success }} />
              ) : null}
            </View>
            <AppText variant="small" bold={d.isToday} tone={d.isToday ? 'primary' : 'muted'}>
              {d.label}
            </AppText>
          </View>
        ))}
      </View>
      <Row gap={12}>
        <Badge label="Done" tone="success" />
        <Badge label="Missed" tone="danger" />
      </Row>
    </Card>
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
        {wrong ? 'The pill photos look wrong' : 'The pill photos were unclear'}
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
              style={{ width: 140, height: 105, borderRadius: 6, backgroundColor: '#ddd' }}
            />
          ))}
        </View>
      ) : null}
      <Row gap={8}>
        {photos ? null : (
          <BigButton tone="ghost" label="View photos" busy={busy} onPress={onView} />
        )}
        <BigButton label="Looks fine" disabled={busy} onPress={() => onDecide('approve')} />
        <BigButton
          tone="danger"
          label="Not right"
          disabled={busy}
          onPress={() => onDecide('reject')}
        />
      </Row>
      <AppText variant="small" tone="muted">
        Photos are deleted when you approve, or after 7 days. Every time you view them is recorded.
      </AppText>
    </Card>
  );
}
