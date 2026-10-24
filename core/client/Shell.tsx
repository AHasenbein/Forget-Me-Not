import { Link, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  BigButton,
  Badge,
  Card,
  Chip,
  Row,
  Screen,
  Stack,
} from '../design-system/components';
import { palette } from '../design-system/tokens';
import { ApiError } from './api';
import { usePoll } from './hooks';
import { formatTime } from './format';
import { SignIn } from './SignIn';
import { PERSONAS, TEXT_SIZES, useSession } from './session';
import { widgetsFor } from './widgets';

export function TopBar() {
  const { demo, persona, setPersona } = useSession();
  const path = usePathname();
  const onSettings = path === '/settings';
  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderBottomWidth: 2,
        borderColor: palette.border,
        padding: 12,
        gap: 8,
      }}
    >
      <Row gap={8}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <AppText variant="body" bold>
            Forget Me Not
          </AppText>
        </View>
        {/* Demo badge never shows on patient screens (root rule). */}
        {demo && persona !== 'patient' ? <Badge label="Demo data" tone="warn" /> : null}
        <Link href={onSettings ? '/' : '/settings'} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={onSettings ? 'Back to home' : 'Settings'}
            style={{
              minHeight: 64,
              minWidth: 64,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderRadius: 16,
              borderColor: palette.border,
              paddingHorizontal: 12,
            }}
          >
            <AppText variant="small" bold>
              {onSettings ? '← Back' : '⚙ Settings'}
            </AppText>
          </Pressable>
        </Link>
      </Row>
      {demo ? (
        <Row gap={8}>
          <AppText variant="small" tone="muted">
            View as:
          </AppText>
          {PERSONAS.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              selected={p.id === persona}
              onPress={() => setPersona(p.id)}
            />
          ))}
        </Row>
      ) : null}
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

const today = () =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(),
  );

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
  return (
    <Screen>
      <Stack gap={4}>
        <AppText variant="huge">{role === 'patient' ? 'Today' : 'Margaret’s day'}</AppText>
        <AppText tone="muted">{today()}</AppText>
      </Stack>
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
        <Row gap={8}>
          {TEXT_SIZES.map((t) => (
            <Chip
              key={t.label}
              label={t.label}
              selected={t.scale === textScale}
              onPress={() => setTextScale(t.scale)}
            />
          ))}
        </Row>
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
