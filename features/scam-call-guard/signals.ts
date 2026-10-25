import type { Signal, Warning } from './schemas';

/**
 * Deterministic scam rules. The transcript is attacker-controlled, so a model alone can be talked into "this is safe";
 * these rules cannot. A rule hit is never lowered by the AI.
 */
const RULES: Record<Signal, RegExp[]> = {
  gift_card: [
    /\bgift[\s-]?cards?\b/,
    /\b(itunes|google play|steam|apple|target|walmart|amazon|visa)\s+(gift\s+)?cards?\b/,
    /\bprepaid\s+(debit\s+)?cards?\b/,
  ],
  wire_transfer: [
    /\bwire (the |me |us )?(money|transfer|funds)\b/,
    /\bwire transfer\b/,
    /\b(western union|moneygram|zelle|cash ?app|venmo)\b/,
  ],
  crypto: [/\b(bitcoin|ethereum|crypto(currency)?)\b/],
  read_numbers: [
    /\b(read|tell|give|send|share|say)\b[^.?!]{0,40}\b(numbers?|codes?|pin|scratch)\b/,
    /\bscratch (off|the)\b/,
    /\bback of the card\b/,
    /\bsocial security number\b/,
  ],
  authority: [
    /\b(irs|internal revenue|social security administration|medicare|medicaid|fbi|sheriff|police department)\b/,
    /\barrest warrant\b/,
    /\bback taxes?\b/,
    /\byour (bank )?account (has been|is) (suspended|frozen|compromised|locked)\b/,
  ],
  grandchild_in_trouble: [
    /\bbail( money)?\b/,
    /\b(grandma|grandpa|grandson|granddaughter|it'?s me)\b[^.?!]{0,80}\b(jail|accident|arrested|hospital|trouble)\b/,
  ],
  remote_access: [
    /\b(anydesk|teamviewer|remote access|log me in|control your computer)\b/,
    /\binstall (this|the) (app|software|program)\b/,
    /\byour computer (has|is) (a )?(virus|infected)\b/,
  ],
  secrecy: [
    /\b(don'?t|do not|not) (tell|say anything to|mention)\b[^.?!]{0,40}\b(anyone|anybody|family|son|daughter|bank|caregiver)\b/,
    /\bkeep (this|it) (a )?secret\b/,
    /\bour (little )?secret\b/,
  ],
  urgency: [
    /\b(right now|immediately|urgent(ly)?|today only|last chance|within the hour|before it'?s too late|hurry)\b/,
  ],
};

const WEIGHT: Record<Signal, number> = {
  gift_card: 3,
  wire_transfer: 3,
  crypto: 3,
  remote_access: 3,
  read_numbers: 2,
  authority: 2,
  grandchild_in_trouble: 2,
  secrecy: 2,
  urgency: 1,
};
/** One payment word alone ("my grandson wants a gift card") is only a caution; payment plus pressure is danger. */
export const CAUTION_SCORE = 3;
export const DANGER_SCORE = 5;

export const PAYMENT_SIGNALS: readonly Signal[] = ['gift_card', 'wire_transfer', 'crypto'];

const normalise = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');

export function detectSignals(text: string): Signal[] {
  const t = normalise(text);
  return (Object.keys(RULES) as Signal[]).filter((s) => RULES[s].some((r) => r.test(t)));
}

export function levelFor(signals: readonly Signal[]): Warning {
  const score = signals.reduce((n, s) => n + WEIGHT[s], 0);
  return score >= DANGER_SCORE ? 'danger' : score >= CAUTION_SCORE ? 'caution' : 'none';
}

const RANK: Record<Warning, number> = { none: 0, caution: 1, danger: 2 };
export const maxLevel = (a: Warning, b: Warning): Warning => (RANK[a] >= RANK[b] ? a : b);
export const isHigher = (a: Warning, b: Warning) => RANK[a] > RANK[b];
