import { Slot } from 'expo-router';
import { View } from 'react-native';
import { SessionProvider } from '@core/client/session';
import { BottomNav, TopBar } from '@core/client/Shell';

export default function RootLayout() {
  return (
    <SessionProvider>
      <View style={{ flex: 1 }}>
        <TopBar />
        <Slot />
        <BottomNav />
      </View>
    </SessionProvider>
  );
}
