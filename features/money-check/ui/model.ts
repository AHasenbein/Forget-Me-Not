import type { Kind, Level, PatientStatus, Reason } from '../schemas';

export const KIND_CHOICES: readonly { kind: Kind; label: string }[] = [
  { kind: 'gift_card', label: 'Someone wants gift cards' },
  { kind: 'caller_wants_money', label: 'A caller wants money' },
  { kind: 'bill', label: 'I have a bill to pay' },
];

/** Caregiver-facing label for what the patient said. */
export const kindLabel = (k: Kind): string =>
  k === 'gift_card'
    ? 'Someone asked for gift cards'
    : k === 'caller_wants_money'
      ? 'A caller wants money'
      : 'A bill to pay';

/** Plain words for the patient. Never an amount, a name or a code. */
export function patientStatusText(status: PatientStatus): { title: string; body: string } {
  switch (status) {
    case 'ok_to_go':
      return { title: 'Your caregiver says this is OK', body: 'You can go ahead.' };
    case 'dont_pay':
      return {
        title: 'Please don’t pay',
        body: 'Your caregiver will help you with this.',
      };
    case 'no_one_reachable':
      return {
        title: 'Please don’t pay yet',
        body: 'We are still trying to reach your caregiver.',
      };
    default:
      return { title: 'Please wait', body: 'We asked your caregiver to check. Don’t pay yet.' };
  }
}

/** One calm sentence of "why", from the reason codes. Only said to the patient when it is reassuring or protective. */
export function patientReason(reasons: readonly Reason[]): string | null {
  if (reasons.includes('gift_card_payment')) return 'Real bills are never paid with gift cards.';
  if (reasons.includes('caller_pressure'))
    return 'Real offices never ask for money over the phone.';
  if (reasons.includes('large_amount')) return 'This one is bigger than usual, so we check twice.';
  if (reasons.includes('no_matching_bill')) return 'We could not find this bill.';
  return null;
}

/** Caregiver-facing explanation per reason. */
export function caregiverReason(r: Reason): string {
  switch (r) {
    case 'gift_card_payment':
      return 'Paying with gift cards is the most common scam payment. No real bill asks for it.';
    case 'caller_pressure':
      return 'Someone on the phone asked for money. Real offices do not demand payment by phone.';
    case 'no_matching_bill':
      return 'No unpaid bill was found at the bank, so there is nothing this could be.';
    case 'large_amount':
      return 'The bill is larger than usual. Compare it with the paper bill.';
    case 'known_bill':
      return 'This matches an unpaid bill at the bank.';
  }
}

export const levelTone = (l: Level) =>
  l === 'stop' ? 'danger' : l === 'check' ? 'warn' : 'primary';
export const levelTitle = (l: Level) =>
  l === 'stop' ? 'Likely a scam' : l === 'check' ? 'Needs a closer look' : 'Looks normal';

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function patientError(code: string): string {
  return code === 'offline'
    ? 'I can’t reach the app right now. Please try again.'
    : 'That didn’t work. Please try again.';
}

export function caregiverError(code: string): string {
  switch (code) {
    case 'offline':
      return 'Can’t reach the server.';
    case 'already_decided':
      return 'Someone already answered this.';
    case 'expired':
      return 'This request ran out of time, so it was declined.';
    case 'not_found':
      return 'That request no longer exists.';
    default:
      return 'That didn’t work. Please try again.';
  }
}

export const POLL_MS = 5_000;
/** How long the "tap again to approve" state lasts, so a stray later tap cannot approve a payment. */
export const ARM_MS = 5_000;
