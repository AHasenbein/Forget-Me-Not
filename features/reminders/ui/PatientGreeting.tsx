import { View } from 'react-native';
import { usePoll } from '@core/client/hooks';
import { useSession } from '@core/client/session';
import { AppText, Hero, ProgressDots } from '@core/design-system/components';
import { dateLabelFor, greetingFor, type TodayResponse } from './model';

/** Patient: "Good morning" banner with today's date and progress. Its own widget so the paper can sit under it. */
export function PatientGreeting() {
  const { api, token } = useSession();
  const { data } = usePoll(() => api<TodayResponse>('GET', '/api/reminders/today'), 2000, [token]);
  if (!data) return null;
  const items = data.occurrences;
  const total = items.filter((o) => o.phase !== 'skipped').length;
  const doneCount = items.filter((o) => o.phase === 'confirmed').length;
  return (
    <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
      <Hero>
        <View style={{ gap: 4 }}>
          <AppText variant="huge" tone="inverse">
            {greetingFor(data.now, items[0]?.timeZone)}
          </AppText>
          <AppText tone="inverseMuted">{dateLabelFor(data.now, items[0]?.timeZone)}</AppText>
        </View>
        {total > 0 ? <ProgressDots inverse done={doneCount} total={total} /> : null}
      </Hero>
    </View>
  );
}
