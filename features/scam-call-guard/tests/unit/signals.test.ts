import { describe, expect, it } from 'vitest';
import { detectSignals, levelFor } from '../../signals';

const level = (t: string) => levelFor(detectSignals(t));

/** Tactics from FTC / AARP / state consumer-protection guidance, each as a realistic spoken line. */
const SCAMS: Record<string, string> = {
  'credit card rate reduction':
    'Hello, this is Cardholder Services. We can reduce the interest rate on your credit card to 1 percent.',
  'rate reduction, paraphrased':
    'You have been pre-approved to lower your interest rate. Press one to speak to a representative.',
  'car warranty': 'We have been trying to reach you about your extended car warranty.',
  'lottery fee first':
    'Congratulations, you have won the sweepstakes! You just pay a small processing fee to claim your prize.',
  'bank safe account':
    'This is your bank fraud department. Move your savings to a safe account right away.',
  'courier pickup': 'A courier will come to collect your bank card and your cash today.',
  'fake charge refund':
    'We saw a suspicious charge on your Amazon account. To get your refund, install the app and let me log me in.',
  'utility shutoff': 'Your electric service will be disconnected today unless you pay immediately.',
  grandchild: "Grandma, it's me. I'm in jail and I need bail money. Please don't tell mom.",
  'tech support':
    'Microsoft support here. Your computer has a virus. Install the app so I can log me in.',
  'social security':
    'Your Social Security number has been suspended. Confirm your social security number to fix it.',
  'verify details':
    'For security purposes we need to verify your account and date of birth right now.',
  'money order': 'Send the money by cashier’s check or a money order today.',
};
const NORMAL = [
  'Hi Mum, it is Sam. Are we still on for dinner on Sunday? I will bring the dessert.',
  'Your appointment with Dr Lee is on Tuesday at ten. Please bring your Medicare card.',
  'I won at bingo last night, you should have seen it!',
  'The weather is lovely. Can you hear me okay? The line is a bit crackly.',
  'Do you want me to pick up some milk and bread on the way over?',
];

describe('scam rules', () => {
  for (const [name, text] of Object.entries(SCAMS))
    it(`flags: ${name}`, () => expect(level(text)).not.toBe('none'));

  it('escalates the credit card rate scam to danger once it asks for card details or a fee', () => {
    const base = 'This is Cardholder Services, we can lower your interest rate to 1 percent.';
    expect(level(base)).toBe('caution');
    expect(level(`${base} We just need your credit card number.`)).toBe('danger');
    expect(level(`${base} There is a one-time fee first.`)).toBe('danger');
  });

  it('flags any mention of Social Security as danger straight away', () => {
    for (const t of [
      'Hello, I am calling about your Social Security.',
      'This is the social-security office.',
      'We need your SSN.',
      'This is the SSA calling.',
    ])
      expect(level(t), t).toBe('danger');
  });

  it('keeps weak signals alone quiet (a real bank may say these too)', () => {
    expect(level('We noticed a suspicious charge on your card.')).toBe('none');
    expect(level('Please verify your date of birth.')).toBe('none');
  });

  for (const text of NORMAL)
    it(`stays quiet: ${text.slice(0, 40)}…`, () => expect(level(text)).toBe('none'));
});
