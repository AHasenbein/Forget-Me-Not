/** Notification port. Production impl (Expo push / SMS) arrives in Stage 2; tests use core/testing mocks. */
export interface Notifier {
  push(
    toUserId: string,
    message: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void>;
  sms(toUserId: string, body: string): Promise<void>;
}
