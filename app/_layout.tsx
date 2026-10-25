import { Slot } from 'expo-router';
import { SessionProvider } from '@core/client/session';
import { AppFrame } from '@core/client/Shell';

export default function RootLayout() {
  return (
    <SessionProvider>
      <AppFrame>
        <Slot />
      </AppFrame>
    </SessionProvider>
  );
}
