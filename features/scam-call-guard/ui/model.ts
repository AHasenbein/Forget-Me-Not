export type Warning = 'none' | 'caution' | 'danger';

export interface CallItem {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'ended';
  warning: Warning;
  signals: string[];
  needsReview: boolean;
  review: 'confirmed_scam' | 'false_alarm' | null;
}
export interface CallDetail extends CallItem {
  summary: string | null;
  aiDisagrees: boolean;
}

const SIGNAL_WORDS: Record<string, string> = {
  gift_card: 'asked for gift cards',
  wire_transfer: 'asked for money by wire, cash or a payment app',
  crypto: 'asked for crypto',
  read_numbers: 'asked to read out numbers',
  personal_info: 'asked for private details (like a Social Security or card number)',
  verify_details: 'asked to "verify" account details',
  authority: 'claimed to be an official or from a bank',
  threat: 'made threats (arrest, shut-off, legal action)',
  rate_offer: 'made an unrequested offer (like a lower interest rate)',
  prize_win: 'said you won a prize',
  advance_fee: 'asked for a fee up front',
  safe_account: 'asked to move money to a "safe" place or hand it to a courier',
  fake_charge: 'talked about a suspicious charge or refund',
  keep_on_line: 'pressed you to stay on the line or trust them',
  say_yes: 'tried to get a "yes" out of you',
  grandchild_in_trouble: 'said a relative is in trouble',
  remote_access: 'asked for access to the computer',
  secrecy: 'asked to keep it secret',
  urgency: 'pushed to act right now',
};
export const signalWords = (signals: readonly string[]) => signals.map((s) => SIGNAL_WORDS[s] ?? s);

/** Plain-language reasons for the patient-facing errors (no codes, no jargon). */
export function patientError(code: string): string {
  if (code === 'recording_disabled') return 'Call checking is not switched on yet.';
  if (code === 'not_linked') return 'This account is not set up yet.';
  if (code === 'offline') return 'No connection right now. Please try again.';
  return 'Something went wrong. Please try again.';
}

export function caregiverTitle(c: CallItem): string {
  if (c.warning === 'danger') return 'Possible scam call';
  if (c.warning === 'caution') return 'Call to double-check';
  return c.needsReview ? 'Call needs a look' : 'Call looked fine';
}
