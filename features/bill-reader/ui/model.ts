import type { Utility } from '@core/ai/documents';
import type { Outcome, RedFlag, Source } from '../schemas';

/** A scan as the patient's screen gets it (facts only). */
export interface PatientScan {
  id: string;
  createdAt: string;
  outcome: Outcome;
  utility: Utility;
  payee: string;
  amountCents: number | null;
  dueDate: string | null;
  dueInDays: number | null;
}
/** A scan as the caregiver's screen gets it. */
export interface CaregiverScan extends PatientScan {
  redFlags: RedFlag[];
  confidence: number;
  source: Source;
}

const KIND: Record<Utility, string> = {
  electric: 'Electric bill',
  water: 'Water bill',
  gas: 'Gas bill',
  phone: 'Phone bill',
  internet: 'Internet bill',
  insurance: 'Insurance bill',
  rent: 'Rent',
  medical: 'Medical bill',
  tax: 'Tax bill',
  credit_card: 'Credit card bill',
  other: 'A bill',
};
export const utilityLabel = (u: Utility) => KIND[u];

export const NOT_SHOWN = 'Not shown on the bill';

/** "$31.50". Never a guess: a missing amount says so. */
export const moneyText = (cents: number | null) =>
  cents === null ? NOT_SHOWN : `$${(cents / 100).toFixed(2)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 20" from YYYY-MM-DD (read from the text, so no timezone can shift the day). */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? '?'} ${Number(m[3])}` : iso;
}

/** "Nov 20 (in 27 days)". Days come from the server's clock. Overdue is said plainly, not hidden. */
export function dueText(dueDate: string | null, days: number | null): string {
  if (!dueDate) return NOT_SHOWN;
  const d = shortDate(dueDate);
  if (days === null) return d;
  if (days === 0) return `${d} (today)`;
  if (days === 1) return `${d} (tomorrow)`;
  if (days > 1) return `${d} (in ${days} days)`;
  return `${d} (${-days === 1 ? 'yesterday' : `${-days} days ago`}: already late)`;
}

export const whatText = (s: Pick<PatientScan, 'utility' | 'payee'>) =>
  s.payee ? `${utilityLabel(s.utility)} from ${s.payee}` : utilityLabel(s.utility);

/** The three rows of the table. */
export function tableRows(s: PatientScan): { label: string; value: string }[] {
  return [
    { label: 'What it is', value: whatText(s) },
    { label: 'How much', value: moneyText(s.amountCents) },
    { label: 'Pay by', value: dueText(s.dueDate, s.dueInDays) },
  ];
}

/** One plain sentence about what the bill SAYS. It never tells the patient to pay: the caregiver helps with that. */
export function summaryLine(s: PatientScan): string {
  const what = utilityLabel(s.utility).toLowerCase();
  const amount = s.amountCents === null ? null : moneyText(s.amountCents);
  const when = s.dueDate ? shortDate(s.dueDate) : null;
  if (amount && when) return `This ${what} says you owe ${amount}, to pay by ${when}.`;
  if (amount) return `This ${what} says you owe ${amount}. I could not see a date.`;
  if (when) return `This ${what} should be paid by ${when}. I could not see the amount.`;
  return `This looks like a ${what}, but I could not see the amount or the date.`;
}

/** Patient wording per outcome. No scores, codes or jargon. */
export function patientMessage(s: PatientScan): { title: string; body: string } {
  switch (s.outcome) {
    case 'flagged':
      return {
        title: 'Please don’t pay this yet',
        body: 'This bill looks strange. Show it to your caregiver first.',
      };
    case 'unclear':
      return {
        title: 'I could not read this',
        body: 'Try again with more light, or show it to your caregiver.',
      };
    default:
      return {
        title: 'Here is your bill',
        body: 'Nothing has been paid. If you are not sure, ask your caregiver.',
      };
  }
}

export function patientError(code: string): string {
  switch (code) {
    case 'offline':
      return 'I can’t reach the app right now. Please try again.';
    case 'bad_image':
      return 'That picture did not work. Please try another one.';
    case 'too_large':
      return 'That picture is too big. Please take a new one.';
    case 'too_many':
      return 'You have shown a lot of bills today. Please ask your caregiver.';
    default:
      return 'That didn’t work. Please try again.';
  }
}

const FLAG: Record<RedFlag, string> = {
  gift_cards: 'asks to pay with gift cards',
  threat: 'threatens (arrest, lawsuit or a shut-off)',
  pay_by_phone: 'asks to pay by phone right now',
  final_notice: 'says “final notice” to rush you',
};
export const flagText = (f: RedFlag) => FLAG[f];

/** One caregiver row: what it is, how much, when. Says plainly when something was not on the bill. */
export const caregiverLine = (s: CaregiverScan) =>
  s.outcome === 'unclear'
    ? 'Could not read this picture.'
    : `${whatText(s)}: ${s.amountCents === null ? 'amount not shown' : moneyText(s.amountCents)}, ${
        s.dueDate ? `pay by ${dueText(s.dueDate, s.dueInDays)}` : 'no pay-by date shown'
      }`;

export const sourceText = (src: Source, outcome: Outcome) =>
  src === 'sample'
    ? 'Demo sample'
    : outcome === 'unclear'
      ? 'The AI could not read it'
      : 'Read by AI';

export const POLL_MS = 5_000;

/** Flagged bills the caregiver has not marked "Seen it" yet: these count on the dashboard status line. */
export const unseenFlagged = (scans: readonly CaregiverScan[], seen: readonly string[]) =>
  scans.filter((s) => s.outcome === 'flagged' && !seen.includes(s.id));
