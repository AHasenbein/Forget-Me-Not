import type { Signal, Warning } from './schemas';

/**
 * Deterministic scam rules. The transcript is attacker-controlled, so a model alone can be talked into "this is safe";
 * these rules cannot. A rule hit is never lowered by the AI.
 *
 * Tactics come from FTC, AARP and state consumer-protection guidance: untraceable payment (gift cards, wires, crypto,
 * couriers), impersonated officials / banks / tech support, unsolicited rate-reduction and warranty offers, prize
 * "fees", "safe account" transfers, grandchild-in-trouble, and pressure (urgency, secrecy, "stay on the line").
 * Speech-to-text is imperfect and callers paraphrase, so the AI layer catches what these patterns miss.
 */
const RULES: Record<Signal, RegExp[]> = {
  gift_card: [
    /\bgift[\s-]?cards?\b/,
    /\b(itunes|google play|steam|apple|target|walmart|amazon|visa)\s+(gift\s+)?cards?\b/,
    /\bprepaid\s+(debit\s+)?(cards?|vouchers?)\b/,
  ],
  wire_transfer: [
    /\bwire (the |me |us )?(money|transfer|funds)\b/,
    /\bwire transfer\b/,
    /\b(western union|moneygram|zelle|cash ?app|venmo)\b/,
    /\b(money order|cashier'?s check|certified check)\b/,
    /\bsend (me |us )?(money|cash|funds)\b/,
    /\bcash\b[^.?!]{0,30}\b(envelope|in the mail|mail it)\b/,
  ],
  crypto: [/\b(bitcoin|ethereum|crypto(currency)?)\b/],
  read_numbers: [
    /\b(read|tell|give|send|share|say)\b[^.?!]{0,40}\b(numbers?|codes?|pin|scratch)\b/,
    /\bscratch (off|the)\b/,
    /\bback of the card\b/,
  ],
  personal_info: [
    /\bsocial security (number|#)\b/,
    /\bssn\b/,
    /\b(bank|checking|savings) account (number|details)\b/,
    /\b(credit |debit )?card (number|details)\b/,
    /\b(card|account) (expiry|expiration)\b|\bsecurity code\b|\bcvv\b/,
    /\bmedicare (number|id)\b/,
    /\bmother'?s maiden name\b/,
    /\b(password|passcode|pin number|(one[- ]time|verification) (code|password))\b/,
  ],
  verify_details: [
    /\b(verify|confirm|update)\b[^.?!]{0,30}\b(account|identity|date of birth|address|card|information|details)\b/,
    /\bfor (security|verification) (purposes|reasons)\b/,
  ],
  authority: [
    /\b(irs|internal revenue|social security administration|medicare|medicaid|fbi|sheriff|police department|customs)\b/,
    /\b(bank'?s?|card|security|fraud) (fraud )?(department|team|office|investigator)\b/,
    /\barrest warrant\b/,
    /\bback taxes?\b/,
    /\byour (bank )?account (has been|is) (suspended|frozen|compromised|locked)\b/,
    /\bmedicare card\b/,
  ],
  threat: [
    /\b(shut ?off|disconnect(ed)?|cut off)\b[^.?!]{0,30}\b(power|electric|water|gas|service|utilit)/,
    /\b(power|electric|water|gas|service)\b[^.?!]{0,30}\b(shut ?off|disconnect(ed)?|cut off)\b/,
    /\b(legal action|lawsuit|sue you|deported|deportation|warrant)\b/,
    /\bor (else )?(you will|your [a-z ]{1,20} will) (be )?(arrest|suspend|cancel|shut|disconnect|freez|froze|lose)/,
  ],
  rate_offer: [
    /\b(lower|reduce|reduction|drop|cut|decrease|slash)\b[^.?!]{0,30}\b(interest|apr)\b/,
    /\b(interest|apr)\b[^.?!]{0,30}\b(lower|reduce|reduction|drop|cut|decrease|down to|as low as)\b/,
    /\b(interest rate|apr)\b[^.?!]{0,30}\b(to|at) (0|1|2|3|zero|one|two|three)(\.\d+)? ?(%|percent)/,
    /\bcardholder services\b|\bmember services\b/,
    /\b(pre-?approved|pre-?qualified|specially selected|you'?ve been selected)\b/,
    /\bdebt (relief|consolidation|forgiveness)\b|\bstudent loan (forgiveness|relief)\b/,
    /\b(extended )?(car|auto|vehicle) warranty\b/,
    /\b(press|push) (1|one)\b/,
  ],
  prize_win: [
    /\byou('ve| have)? (just )?won\b/,
    /\bcongratulations\b[^.?!]{0,40}\b(won|winner|selected|prize)\b/,
    /\b(sweepstakes|lottery|publishers clearing house|inheritance)\b/,
    /\bclaim (your )?(prize|winnings|reward)\b/,
  ],
  advance_fee: [
    /\b(processing|handling|administration|insurance|activation|service|one[- ]time) fee\b/,
    /\b(fee|fees|tax(es)?|duties|customs)\b[^.?!]{0,40}\b(first|before|upfront|up front|to release|to claim|to receive|to unlock)\b/,
    /\bsmall (fee|payment|deposit)\b/,
  ],
  safe_account: [
    /\b(safe|secure|protected) account\b/,
    /\bmove (all )?(your )?(money|funds|savings)\b/,
    /\btransfer (all )?(your )?(money|funds|savings)\b[^.?!]{0,30}\b(safe|secure|protect)/,
    /\bcourier\b/,
    /\bwithdraw (cash|money)\b[^.?!]{0,40}\b(hand|give|courier|pick)/,
  ],
  fake_charge: [
    /\b(unauthorized|suspicious|fraudulent|unusual) (charge|purchase|transaction|activity|login|order)\b/,
    /\b(refund|reimburse)\b[^.?!]{0,40}\b(overpa|mistake|error|charged)/,
    /\b(microsoft|windows|apple|amazon|paypal) (support|technician|security|fraud)\b/,
  ],
  keep_on_line: [
    /\b(don'?t|do not) hang up\b/,
    /\bstay on the (line|phone)\b/,
    /\bkeep me on the (line|phone)\b/,
    /\byou (can )?trust me\b/,
    /\b(don'?t|do not) (need to |have to )?(check|verify|call)\b[^.?!]{0,30}\b(anyone|anybody|bank|us|back)\b/,
  ],
  say_yes: [
    /\bcan you hear me\b/,
    /\b(just )?say (yes|okay)\b/,
    /\bare you the (homeowner|owner|account holder|person in charge)\b/,
  ],
  grandchild_in_trouble: [
    /\bbail( money)?\b/,
    /\b(grandma|grandpa|grandson|granddaughter|it'?s me|guess who)\b[^.?!]{0,80}\b(jail|accident|arrested|hospital|trouble|lawyer)\b/,
    /\b(new (phone )?number|lost my phone)\b[^.?!]{0,60}\b(money|help|send)\b/,
  ],
  remote_access: [
    /\b(anydesk|teamviewer|remote access|log me in|control your computer)\b/,
    /\binstall (this|the) (app|software|program)\b/,
    /\byour computer (has|is) (a )?(virus|infected)\b/,
  ],
  secrecy: [
    /\b(don'?t|do not|not) (tell|say anything to|mention)\b[^.?!]{0,40}\b(anyone|anybody|family|son|daughter|bank|caregiver|mom|dad|parents)\b/,
    /\bkeep (this|it) (a )?secret\b/,
    /\bour (little )?secret\b/,
    /\bbetween (us|you and me)\b/,
  ],
  urgency: [
    /\b(right now|immediately|urgent(ly)?|today only|last chance|within the hour|before it'?s too late|hurry)\b/,
    /\b(act|respond|decide|call back|pay) (today|now|fast|quickly|right away)\b/,
    /\b(limited time|offer (ends|expires)|expires (today|tonight|soon)|within (24|48) hours)\b/,
  ],
};

const WEIGHT: Record<Signal, number> = {
  gift_card: 3,
  wire_transfer: 3,
  crypto: 3,
  remote_access: 3,
  personal_info: 3,
  rate_offer: 3,
  advance_fee: 3,
  safe_account: 3,
  read_numbers: 2,
  authority: 2,
  threat: 2,
  prize_win: 2,
  verify_details: 2,
  fake_charge: 2,
  keep_on_line: 2,
  say_yes: 2,
  grandchild_in_trouble: 2,
  secrecy: 2,
  urgency: 1,
};
/** One payment word alone ("my grandson wants a gift card") is only a caution; payment plus pressure is danger. */
export const CAUTION_SCORE = 3;
export const DANGER_SCORE = 5;

export const PAYMENT_SIGNALS: readonly Signal[] = [
  'gift_card',
  'wire_transfer',
  'crypto',
  'advance_fee',
  'safe_account',
];

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
