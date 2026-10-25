import { Link, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BigButton,
  Badge,
  Card,
  Chip,
  Icon,
  Row,
  Segmented,
  Screen,
} from '../design-system/components';
import { font, palette } from '../design-system/tokens';
import { ApiError } from './api';
import { usePoll } from './hooks';
import { formatTime } from './format';
import { SignIn } from './SignIn';
import { PERSONAS, TEXT_SIZES, useSession } from './session';
import {
  bySection,
  DASHBOARD_LAYOUT,
  dashboardItems,
  dashboardStatus,
  rowsFor,
  WIDGET_GROUPS,
  type AttentionReport,
  type DashboardStatus,
} from './widget-groups';
import { AttentionContext } from './attention';
import { DensityContext, FillContext } from '../design-system/text-scale';
import { widgetsFor } from './widgets';
import type { DashboardSection, Widget, WidgetGroup } from '../feature-registry/ui';

export function TopBar({ hideBrand }: { hideBrand?: boolean } = {}) {
  const { demo, persona, setPersona, role } = useSession();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const onSettings = path === '/settings';
  const patient = role === 'patient';
  const { width } = useWindowDimensions();
  // Patient on a wide screen: the persona switcher sits between the flower and Settings (one row, less empty space).
  // Phones keep it on its own row: the patient-size tabs need the full width.
  const switcherInline = patient && width >= 640;
  const switcher = demo ? (
    <Segmented
      options={PERSONAS.map((p) => ({ id: p.id, label: p.label }))}
      value={persona}
      onChange={setPersona}
    />
  ) : null;
  return (
    <View
      style={{
        backgroundColor: palette.bg,
        paddingTop: insets.top + 8,
        paddingHorizontal: patient ? 20 : 12,
        paddingBottom: 8,
        gap: 8,
        alignItems: 'center',
      }}
    >
      {/* Caregivers: as wide as their dashboard, so the bar lines up with it. */}
      <View style={{ width: '100%', maxWidth: hideBrand ? 1120 : patient ? 720 : 1440, gap: 8 }}>
        <Row gap={8}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="flower" size={36} />
            {!patient && !hideBrand ? (
              <Text numberOfLines={1} style={{ fontSize: 18, ...font.bold, color: palette.text }}>
                Forget Me Not
              </Text>
            ) : null}
            {switcherInline ? switcher : null}
          </View>
          {/* Demo badge never shows on patient screens (root rule). */}
          {demo && !patient ? <Badge label="Demo data" tone="warn" /> : null}
          {/* One corner control on its own page for both roles (the caregiver dashboard has no room for settings). */}
          {role === 'patient' || role === 'primary_caregiver' ? (
            <Link href={onSettings ? '/' : '/settings'} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={onSettings ? 'Back to home' : 'Settings'}
                style={{
                  minHeight: patient ? 64 : 40,
                  minWidth: patient ? 64 : 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  backgroundColor: palette.card,
                  borderWidth: 1,
                  borderColor: palette.border,
                  paddingHorizontal: 16,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name={onSettings ? 'back' : 'sliders'} size={patient ? 26 : 20} />
                  <Text style={{ fontSize: patient ? 24 : 16, ...font.bold, color: palette.text }}>
                    {onSettings ? 'Back' : 'Settings'}
                  </Text>
                </View>
              </Pressable>
            </Link>
          ) : null}
        </Row>
        {switcherInline ? null : switcher}
      </View>
    </View>
  );
}

/**
 * Root frame: top bar, then the page. Only the patient (and anyone not signed in yet) gets the large patient UI;
 * caregivers and family get an ordinary app UI.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const { role } = useSession();
  const density = role === 'primary_caregiver' || role === 'circle_member' ? 'standard' : 'patient';
  return (
    <DensityContext.Provider value={density}>
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <TopBar />
        {children}
      </View>
    </DensityContext.Provider>
  );
}

function Widgets() {
  const { role, token } = useSession();
  const widgets = role ? widgetsFor(role) : [];
  if (!widgets.length)
    return (
      <Card>
        <AppText>Nothing to show yet.</AppText>
      </Card>
    );
  return (
    <>
      {dashboardItems(widgets).map((item) =>
        item.kind === 'widget' ? (
          <item.widget.Component key={`${token}:${item.widget.id}`} />
        ) : (
          <WidgetGroupView
            key={`${token}:${item.group}`}
            group={item.group}
            members={item.members}
          />
        ),
      )}
    </>
  );
}

/** Idle time before an open group folds back to its one button. */
const GROUP_IDLE_MS = 5000;

/**
 * One button ("Before I pay") that opens its members' own sub-buttons. It folds back by itself after 5 s with no touch or
 * typing (no Back button for a confused user to hunt for). Members stay mounted so their state survives and a pending
 * warning stays visible while the group is closed.
 */
function WidgetGroupView({ group, members }: { group: WidgetGroup; members: Widget[] }) {
  const [open, setOpen] = useState(false);
  const [beat, setBeat] = useState(0);
  const touch = useCallback(() => setBeat((n) => n + 1), []);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), GROUP_IDLE_MS);
    return () => clearTimeout(t);
  }, [open, beat]);
  return (
    <View
      style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 }}
      onStartShouldSetResponderCapture={() => {
        touch();
        return false; // only listen; the tap still reaches the button
      }}
    >
      {members.map((w) => (
        <w.Component key={w.id} collapsed={!open} onActivity={touch} />
      ))}
      {open ? null : (
        <BigButton tone="ghost" label={WIDGET_GROUPS[group]} onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

export function Home() {
  const { role, liveStatus, signOut } = useSession();
  if (liveStatus === 'loading')
    return (
      <Screen>
        <Card>
          <AppText center>One moment…</AppText>
        </Card>
      </Screen>
    );
  if (liveStatus === 'signed_out') return <SignIn />;
  if (liveStatus === 'no_access')
    return (
      <Screen>
        <Card tone="warn">
          <AppText variant="title">You’re signed in, but this account isn’t set up yet</AppText>
          <AppText>Ask your caregiver to add you.</AppText>
          <BigButton label="Sign out" tone="ghost" onPress={signOut} />
        </Card>
      </Screen>
    );
  if (role === 'circle_member')
    return (
      <Screen>
        <Card>
          <AppText variant="title">Hello</AppText>
          <AppText>
            There’s nothing for you here yet. Check-ins and sharing are coming soon.
          </AppText>
        </Card>
      </Screen>
    );
  // The date and greeting come from the widgets (they use the server's `now`, not the device clock).
  if (role === 'primary_caregiver') return <CaregiverPage />;
  return (
    <Screen>
      <Widgets />
    </Screen>
  );
}

const TILE_GAP = 12;
const MAX_WIDTH = 1440;

/** Gives one widget its own reporter for the status line, and withdraws its report when it unmounts. */
function AttentionSlot({
  id,
  onReport,
  children,
}: {
  id: string;
  onReport: (id: string, r: AttentionReport | null) => void;
  children: ReactNode;
}) {
  const report = useCallback((r: AttentionReport) => onReport(id, r), [id, onReport]);
  useEffect(() => () => onReport(id, null), [id, onReport]);
  return <AttentionContext.Provider value={report}>{children}</AttentionContext.Provider>;
}

const STATUS_BG = {
  danger: palette.dangerBg,
  warn: palette.warnBg,
  success: palette.successBg,
  neutral: palette.card,
} as const;
const STATUS_RULE = {
  danger: palette.danger,
  warn: palette.warn,
  success: palette.success,
  neutral: palette.border,
} as const;

/** The one answer to "is everything OK?": a tinted banner, headline on top and what it is about underneath. */
function StatusLine({ status }: { status: DashboardStatus }) {
  const tone = status.tone === 'neutral' ? undefined : status.tone;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        gap: 4,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 6,
        borderLeftWidth: 6,
        borderLeftColor: STATUS_RULE[status.tone],
        backgroundColor: STATUS_BG[status.tone],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {tone ? (
          <Icon name={tone === 'success' ? 'check' : 'alert'} size={28} color={palette[tone]} />
        ) : null}
        <View style={{ flex: 1 }}>
          <AppText variant="title" tone={tone}>
            {status.title}
          </AppText>
        </View>
      </View>
      {status.detail ? <AppText>{status.detail}</AppText> : null}
    </View>
  );
}

/**
 * "Needs you" box: the status banner, then each open alert card (lost, payment, call, bill, missed reminder), then
 * "Worth knowing" (the `activity` section): not alerts, just what someone else did that you would want to hear about
 * (a family member looked at the location, another caregiver opened pill photos). Each full record is one tap away
 * inside it, so every sensitive view stays visible to the caregiver without a box of its own.
 */
function NeedsYou({
  status,
  children,
  worthKnowing,
}: {
  status: DashboardStatus;
  children: ReactNode;
  worthKnowing: ReactNode[];
}) {
  return (
    <Card>
      <StatusLine status={status} />
      {children}
      {worthKnowing.length ? (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 }}>
          <AppText variant="title">Worth knowing</AppText>
          {worthKnowing}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Caregiver dashboard: the stats strip, then full rows of boxes on one column grid, each row's boxes the same height:
 * Today, Reminders, Location; then the "needs you" box (with Worth knowing), Messages (the morning paper note) and
 * This week (rows of two on narrower windows; see `rowsFor`). The box's status banner says whether anything
 * needs you (widgets report through `useAttention`; it never says "all clear" while something is loading or failed),
 * with the open alert cards under it. It is an ordinary app UI (`standard` density: normal type and controls; Text size is for the
 * patient only). The page scrolls a little on small windows instead of shrinking.
 * Phones stack the same sections in `SECTIONS` order. Widgets come from features via `section`; this file never names a feature.
 */
function CaregiverPage() {
  const { token } = useSession();
  const { width } = useWindowDimensions();
  const wide = width >= 900 && Platform.OS === 'web'; // phones and tablets get the one-column stack
  const sections = bySection(widgetsFor('primary_caregiver'));
  const [reports, setReports] = useState<Record<string, AttentionReport>>({});
  const onReport = useCallback((id: string, r: AttentionReport | null) => {
    setReports((prev) => {
      if (r === null) {
        if (!(id in prev)) return prev;
        const { [id]: _gone, ...rest } = prev;
        return rest;
      }
      return JSON.stringify(prev[id]) === JSON.stringify(r) ? prev : { ...prev, [id]: r };
    });
  }, []);
  const status = dashboardStatus(Object.values(reports));

  const widgetsIn = (ids: readonly DashboardSection[]) =>
    ids.flatMap((id) => sections.find((s) => s.id === id)?.widgets ?? []);
  const slot = (w: Widget) => (
    <AttentionSlot key={`${token}:${w.id}`} id={`${token}:${w.id}`} onReport={onReport}>
      <w.Component />
    </AttentionSlot>
  );
  const frame = (body: ReactNode) => (
    <DensityContext.Provider value="standard">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: TILE_GAP,
          paddingBottom: 40,
          gap: TILE_GAP,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>
    </DensityContext.Provider>
  );
  // One section's tiles; `alerts` becomes the "needs you" box (always shown, so the status is never missing) with
  // "Worth knowing" (`activity`) inside it, so `activity` has no box of its own.
  const section = (id: DashboardSection) =>
    id === 'alerts' ? (
      <NeedsYou key="needs-you" status={status} worthKnowing={widgetsIn(['activity']).map(slot)}>
        {widgetsIn(['alerts']).map(slot)}
      </NeedsYou>
    ) : id === 'activity' ? null : (
      widgetsIn([id]).map(slot)
    );

  // Phones: one column in `SECTIONS` order, the "needs you" box first. No wrappers: a widget that renders nothing
  // (no open alert) leaves no gap.
  if (!wide) return frame(sections.map((s) => section(s.id)));

  const perRow = width >= 1280 ? 3 : 2;
  return frame(
    <>
      {DASHBOARD_LAYOUT.top.map(section)}
      {/* Full rows of boxes on one column grid. Each box stretches to the tallest in its row, so the bottoms line up. */}
      {rowsFor(perRow).map((row) => (
        <View
          key={row.map((c) => c.id).join()}
          style={{ flexDirection: 'row', alignItems: 'stretch', gap: TILE_GAP }}
        >
          {row.map((c) => (
            // A box spanning N columns also covers the N-1 gaps between them, so its edges line up with the row above.
            <View
              key={c.id}
              style={{
                flexGrow: c.span,
                flexShrink: 1,
                flexBasis: (c.span - 1) * TILE_GAP,
                minWidth: 0,
                gap: TILE_GAP,
              }}
            >
              <FillContext.Provider value>{section(c.id)}</FillContext.Provider>
            </View>
          ))}
          {/* A short last row keeps the same column width. */}
          {Array.from({ length: perRow - row.reduce((t, c) => t + c.span, 0) }, (_, i) => (
            <View key={`pad${i}`} style={{ flexGrow: 1, flexBasis: 0 }} />
          ))}
        </View>
      ))}
    </>,
  );
}

// ---- Settings --------------------------------------------------------------------------------

const SPEEDS = [1, 10, 60, 600];
const JUMPS: [string, number][] = [
  ['+10 min', 10],
  ['+30 min', 30],
  ['+2 hours', 120],
];

interface Vision {
  outcome: string;
  options: string[];
}
interface Clock {
  now: string;
  speed: number;
}

function DemoTools() {
  const { api } = useSession();
  const { data: clock, error, reload } = usePoll(() => api<Clock>('GET', '/demo/clock'), 2000, []);
  const { data: vision, reload: reloadVision } = usePoll(
    () => api<Vision>('GET', '/demo/vision'),
    4000,
    [],
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const act = async (label: string, method: string, path: string, body?: unknown) => {
    setBusy(true);
    try {
      await api(method, path, body);
      setNote(label);
      reload();
    } catch (e) {
      setNote(
        e instanceof ApiError && e.code === 'offline'
          ? 'Can’t reach the demo server.'
          : 'That didn’t work.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <AppText variant="title">Demo controls</AppText>
      <AppText tone="muted">
        {error
          ? 'Demo server not reachable. Start it: npm run dev:api:demo'
          : clock
            ? `Demo time: ${formatTime(clock.now)}  ·  speed ${clock.speed}×`
            : 'Loading…'}
      </AppText>
      <AppText variant="small" tone="muted">
        Speed (1× = real time; 60× turns a 30-minute wait into 30 seconds)
      </AppText>
      <Row gap={8}>
        {SPEEDS.map((x) => (
          <Chip
            key={x}
            label={`${x}×`}
            selected={clock?.speed === x}
            onPress={() => void act(`Speed ${x}×`, 'POST', '/demo/clock/speed', { speed: x })}
          />
        ))}
      </Row>
      <AppText variant="small" tone="muted">
        Skip ahead
      </AppText>
      <Row gap={8}>
        {JUMPS.map(([label, minutes]) => (
          <Chip
            key={label}
            label={label}
            onPress={() => void act(`Skipped ${label}`, 'POST', '/demo/clock/jump', { minutes })}
          />
        ))}
      </Row>
      <AppText variant="small" tone="muted">
        Pill photo check: what the next check will “see”
      </AppText>
      <Row gap={8}>
        {(vision?.options ?? []).map((o) => (
          <Chip
            key={o}
            label={{ clear: 'Clear', unclear: 'Unclear', not_taken: 'Not taken' }[o] ?? o}
            selected={vision?.outcome === o}
            onPress={() => {
              void act(`Next check: ${o}`, 'POST', '/demo/vision', { outcome: o });
              reloadVision();
            }}
          />
        ))}
      </Row>
      <BigButton
        label="Reset demo"
        tone="danger"
        busy={busy}
        onPress={() => act('Demo reset', 'POST', '/demo/reset')}
      />
      {note ? (
        <AppText variant="small" tone="muted">
          {note}
        </AppText>
      ) : null}
    </Card>
  );
}

export function SettingsScreen() {
  return (
    <Screen>
      <AppText variant="huge">Settings</AppText>
      <SettingsContent />
    </Screen>
  );
}

/** Settings body, shared by the Settings page (patient) and the caregiver one-pager's last section. */
function SettingsContent() {
  const { demo, role, textScale, setTextScale, email, signOut } = useSession();
  const router = useRouter();
  return (
    <>
      {/* Text size is a patient aid; the caregiver screens use a fixed, ordinary size. */}
      {role === 'patient' ? (
        <Card>
          <AppText variant="title">Text size</AppText>
          <Segmented
            options={TEXT_SIZES.map((t) => ({ id: String(t.scale), label: t.label }))}
            value={String(textScale)}
            onChange={(v) => setTextScale(Number(v))}
          />
          <AppText>This is how large the words look on this device.</AppText>
        </Card>
      ) : null}
      {demo && role !== 'circle_member' ? <DemoTools /> : null}
      <Card>
        <AppText variant="title">About</AppText>
        <AppText tone="muted">{demo ? 'Demo mode: canned, made-up data.' : 'Live mode.'}</AppText>
        {!demo && email ? <AppText tone="muted">Signed in as {email}</AppText> : null}
        {!demo && email ? (
          <BigButton
            label="Sign out"
            tone="ghost"
            onPress={async () => {
              await signOut();
              router.replace('/'); // back to the "Who are you?" screen
            }}
          />
        ) : null}
        {role === 'circle_member' ? (
          <AppText tone="muted">Family and friends can’t change app settings.</AppText>
        ) : null}
      </Card>
    </>
  );
}
