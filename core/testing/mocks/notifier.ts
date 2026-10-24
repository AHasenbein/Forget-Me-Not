import type { Notifier } from '../../notifications';

export function createMockNotifier(): Notifier & {
  sent: { channel: 'push' | 'sms'; to: string; body: string }[];
} {
  const sent: { channel: 'push' | 'sms'; to: string; body: string }[] = [];
  return {
    sent,
    async push(to, m) {
      sent.push({ channel: 'push', to, body: m.body });
    },
    async sms(to, body) {
      sent.push({ channel: 'sms', to, body });
    },
  };
}
