import { Link, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BigButton,
  Badge,
  Card,
  Chip,
  IconCircle,
  Row,
  Segmented,
  Screen,
} from '../design-system/components';
import { palette } from '../design-system/tokens';
import { ApiError } from './api';
import { usePoll } from './hooks';
import { formatTime } from './format';
import { SignIn } from './SignIn';
import { PERSONAS, TEXT_SIZES, useSession } from './session';
import { widgetsFor } from './widgets';

export function TopBar() {
  const { demo, persona, setPersona, role } = useSession();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const onSettings = path === '/settings';
  const patient = role === 'patient';
  return (
    <View
      style={{
        backgroundColor: palette.bg,
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 8,
        gap: 8,
        alignItems: 'center',
      }}
    >
      <View style={{ width: '100%', maxWidth: 720, gap: 8 }}>
        <Row gap={8}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconCircle emoji="🌼" size={40} />
            {!patient ? (
              <Text
                numberOfLines={1}
                style={{ fontSize: 18, fontWeight: '700', color: palette.text }}
              >
                Forget Me Not
              </Text>
            ) : null}
          </View>
          {/* Demo badge never shows on patient screens (root rule). */}
          {demo && !patient ? <Badge label="Demo data" tone="warn" /> : null}
          {/* Patient: one calm corner control. Caregiver uses the bottom bar instead. */}
          {patient ? (
            <Link href={onSettings ? '/' : '/settings'} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={onSettings ? 'Back to home' : 'Settings'}
                style={{
                  minHeight: 64,
                  minWidth: 64,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 32,
                  backgroundColor: palette.card,
                  borderWidth: 1,
                  borderColor: palette.border,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={{ fontSize: 24, fontWeight: '700', color: palette.text }}>
                  {onSettings ? '← Back' : '⚙️ Settings'}
                </Text>
              </Pressable>
            </Link>
          ) : null}
        </Row>
        {demo ? (
          <Segmented
            options={PERSONAS.map((p) => ({ id: p.id, label: `View as ${p.label.toLowerCase()}` }))}
            value={persona}
            onChange={setPersona}
          />
        ) : null}
      </View>
    </View>
  );
}

const NAV = [
  { href: '/', label: 'Home', emoji: '🏠' },
  { href: '/settings', label: 'Settings', emoji: '⚙️' },
] as const;

/** Caregiver bottom bar: two big labelled destinations, always visible, never hidden off-screen. */
export function BottomNav() {
  const { role, liveStatus } = useSession();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  if (role !== 'primary_caregiver' || liveStatus !== 'ready') return null;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: palette.card,
        borderTopWidth: 1,
        borderColor: palette.border,
        paddingBottom: insets.bottom + 4,
        paddingTop: 4,
      }}
    >
      {NAV.map((n) => {
        const on = n.href === '/' ? path === '/' : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  paddingHorizontal: 24,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: on ? palette.primaryBg : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 22 }}>{n.emoji}</Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: on ? palette.primary : palette.muted,
                  }}
                >
                  {n.label}
                </Text>
              </View>
            </Pressable>
          </Link>
        );
      })}
    </View>
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
      {widgets.map((w) => (
        <w.Component key={`${token}:${w.id}`} />
      ))}
    </>
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
          <AppText variant="title">Hello 👋</AppText>
          <AppText>
            There’s nothing for you here yet. Check-ins and sharing are coming soon.
          </AppText>
        </Card>
      </Screen>
    );
  // The date and greeting come from the widgets (they use the server's `now`, not the device clock).
  return (
    <Screen>
      <Widgets />
    </Screen>
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
  const { demo, role, textScale, setTextScale, email, signOut } = useSession();
  const router = useRouter();
  return (
    <Screen>
      <AppText variant="huge">Settings</AppText>
      <Card>
        <AppText variant="title">Text size</AppText>
        <Segmented
          options={TEXT_SIZES.map((t) => ({ id: String(t.scale), label: t.label }))}
          value={String(textScale)}
          onChange={(v) => setTextScale(Number(v))}
        />
        <AppText>This is how large the words look on this device.</AppText>
      </Card>
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
    </Screen>
  );
}
