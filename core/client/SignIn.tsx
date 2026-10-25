import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { QuickAccount } from '../auth/quick-login';
import { AppText, BigButton, Card, IconCircle, Screen, Stack } from '../design-system/components';
import { palette } from '../design-system/tokens';
import { useSession } from './session';

const input = {
  borderWidth: 2,
  borderColor: palette.inputBorder,
  borderRadius: 6,
  paddingHorizontal: 12,
  minHeight: 64,
  fontSize: 24,
  backgroundColor: palette.card,
  color: palette.text,
} as const;

const CHOICES: { account: QuickAccount; label: string }[] = [
  { account: 'caregiver', label: 'Caregiver' },
  { account: 'patient', label: 'Patient' },
];

/** Email + password sign-in (the real thing). Kept intact; the picker below is a dev convenience on top. */
function PasswordForm() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setProblem('');
    try {
      setProblem((await signIn(email, password)) ?? '');
    } catch {
      setProblem('I can’t reach the app right now. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <AppText variant="small" tone="muted">
          Email
        </AppText>
        <TextInput
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={input}
        />
        <AppText variant="small" tone="muted">
          Password
        </AppText>
        <TextInput
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={() => void submit()}
          style={input}
        />
      </View>
      <BigButton label="Sign in" busy={busy} disabled={!email || !password} onPress={submit} />
      {problem ? <AppText tone="danger">{problem}</AppText> : null}
    </Card>
  );
}

/**
 * Signed-out screen. When quick sign-in is on (dev), you pick WHO you are with one tap; the email/password
 * form is still one tap away. When it is off, you only see the form.
 */
export function SignIn() {
  const { quickLogin, signInAs } = useSession();
  const [showForm, setShowForm] = useState(!quickLogin);
  const [busy, setBusy] = useState<QuickAccount | null>(null);
  const [problem, setProblem] = useState('');

  const pick = async (account: QuickAccount) => {
    if (busy) return;
    setBusy(account);
    setProblem('');
    const err = await signInAs(account);
    if (err) {
      setProblem(err);
      setShowForm(true); // the form is the fallback
    }
    setBusy(null);
  };

  return (
    <Screen>
      <Stack gap={12}>
        <IconCircle icon="flower" size={56} />
        <AppText variant="huge">{quickLogin ? 'Who are you?' : 'Welcome back'}</AppText>
        <AppText tone="muted">
          {quickLogin ? 'Tap one to continue.' : 'Sign in to see your day.'}
        </AppText>
      </Stack>
      {quickLogin ? (
        <Card>
          {CHOICES.map((c) => (
            <BigButton
              key={c.account}
              label={c.label}
              busy={busy === c.account}
              disabled={!!busy}
              onPress={() => pick(c.account)}
            />
          ))}
          {problem ? <AppText tone="danger">{problem}</AppText> : null}
          {!showForm ? (
            <BigButton
              tone="ghost"
              label="Use email and password"
              onPress={() => setShowForm(true)}
            />
          ) : null}
        </Card>
      ) : null}
      {showForm ? <PasswordForm /> : null}
    </Screen>
  );
}
