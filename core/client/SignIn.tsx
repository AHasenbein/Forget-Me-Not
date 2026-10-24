import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppText, BigButton, Card, Screen } from '../design-system/components';
import { palette } from '../design-system/tokens';
import { useSession } from './session';

const input = {
  borderWidth: 2,
  borderColor: palette.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  minHeight: 64,
  fontSize: 24,
  backgroundColor: palette.card,
  color: palette.text,
} as const;

/** Big, plain sign-in. One primary button; a wrong login says so in one friendly sentence. */
export function SignIn() {
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
    <Screen>
      <AppText variant="huge">Sign in</AppText>
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
    </Screen>
  );
}
