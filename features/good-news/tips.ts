/**
 * Money-safety tip of the day: the last page of the paper. A fixed, hand-written list (never AI-generated) about keeping
 * money safe, not investment advice. Short, plain words, one idea each, and each ends with what to do.
 */
export const MONEY_TIPS: readonly string[] = [
  'Your bank will never ask for your PIN or password. If someone asks, hang up.',
  'Real companies never ask to be paid with gift cards. If someone asks for gift cards, it is a scam.',
  'If a caller says you must pay right now, it is okay to hang up and call your family first.',
  'Before any big payment, check with someone you trust. There is no rush.',
  'Never read the numbers on a gift card or bank card to someone on the phone.',
  'If you win a prize you never entered, it is not real. Real prizes never ask you to pay a fee.',
  'Keep your bank card in the same safe place every day, and never write your PIN next to it.',
  'Nobody from the government will call to ask for money or threaten to arrest you.',
  'If a message says your account is locked, do not use its link. Call the number on your card instead.',
  'Never let a stranger on the phone control your computer.',
  'A "safe account" for your money does not exist. Your bank never asks you to move your savings.',
  'It is okay to say "Let me think about it" and end the call. Good offers can wait.',
  'Check your bank statement with someone you trust once a month. It helps catch mistakes early.',
  'If someone you only met online asks for money, talk to your family first.',
  'Shred or tear up old letters from the bank before you throw them away.',
  'A family member in trouble can wait a few minutes. Hang up and call them back on their usual number.',
];

/** Same tip all day, a different one each day (by calendar date, so every reader sees the same one). */
export function tipFor(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = Number.isFinite(y) && m && d ? Math.floor(Date.UTC(y!, m - 1, d) / 86_400_000) : 0;
  return MONEY_TIPS[((day % MONEY_TIPS.length) + MONEY_TIPS.length) % MONEY_TIPS.length]!;
}
