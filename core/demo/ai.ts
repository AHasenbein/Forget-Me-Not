import type { AiClient } from '../ai/client';
import type { DemoWorld } from './world';

/** Keyless stand-in for the AI in demo mode: reads a call transcript for scam cues. Not a real model. */
const CUES: { label: string; re: RegExp; strong: boolean }[] = [
  { label: 'gift cards', re: /\bgift[\s-]?cards?\b|\bprepaid\b/i, strong: true },
  {
    label: 'a Social Security number or other private details',
    re: /\bsocial security\b|\bssn\b|\b(bank account|card|medicare) (number|details)\b|\bpassword\b|\b(verification|security|one[- ]time) code\b/i,
    strong: true,
  },
  {
    label: 'a wire transfer or crypto payment',
    re: /\bwire (the |me |us )?(money|transfer|funds)\b|\bwestern union\b|\bmoneygram\b|\bbitcoin\b|\bcrypto/i,
    strong: true,
  },
  {
    label: 'remote access to a computer',
    re: /\banydesk\b|\bteamviewer\b|\bremote access\b|\bcontrol your computer\b/i,
    strong: true,
  },
  {
    label: 'an unrequested offer to lower an interest rate or clear debt',
    re: /\b(lower|reduce|reduction|drop|cut)\b[^.?!]{0,30}\binterest\b|\binterest rate\b[^.?!]{0,30}\b(lower|reduce|reduction|down to)\b|\bcardholder services\b|\bdebt (relief|consolidation)\b|\bcar warranty\b/i,
    strong: true,
  },
  {
    label: 'a fee to be paid first',
    re: /\b(processing|handling|activation|one[- ]time) fee\b|\b(you('ve| have) won|sweepstakes|lottery)\b/i,
    strong: true,
  },
  {
    label: 'moving money to a "safe" account or a courier',
    re: /\b(safe|secure) account\b|\bmove (your )?(money|funds|savings)\b|\bcourier\b/i,
    strong: true,
  },
  {
    label: 'bail or emergency money',
    re: /\bbail\b|\b(in|from) jail\b|\barrested\b/i,
    strong: false,
  },
  {
    label: 'secrecy',
    re: /\b(don'?t|do not) tell (anyone|anybody|your)\b|\bkeep (this|it) (a )?secret\b/i,
    strong: false,
  },
  {
    label: 'a government threat',
    re: /\birs\b|\bback taxes\b|\barrest warrant\b|\bsocial security administration\b/i,
    strong: false,
  },
  {
    label: 'pressure to act now',
    re: /\bright now\b|\bimmediately\b|\burgent(ly)?\b|\bhurry\b/i,
    strong: false,
  },
];

const list = (xs: string[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * Answers the `scam_call_assess` task (JSON verdict + summary) from the transcript; any other task gets the canned
 * summary from the demo world, as before. Same output shape as the live adapter, so features need no demo branch.
 */
export function createDemoAi(world: DemoWorld): AiClient {
  return {
    async complete({ task, content }) {
      if (task !== 'scam_call_assess')
        return { text: world.scamCall.summary, confidence: world.scamCall.confidence };
      const transcript = /<transcript>([\s\S]*?)<\/transcript>/.exec(content)?.[1] ?? '';
      const hits = CUES.filter((c) => c.re.test(transcript));
      const scam = hits.some((h) => h.strong) || hits.length >= 2;
      return scam
        ? {
            text: JSON.stringify({
              verdict: 'scam',
              summary: `Likely scam: the caller brought up ${list(hits.map((h) => h.label))}.`,
            }),
            confidence: 0.95,
          }
        : {
            text: JSON.stringify({
              verdict: 'not_scam',
              summary:
                'Sounds like an ordinary conversation, with no request for money or private details.',
            }),
            confidence: 0.9,
          };
    },
  };
}
