import { describe, expect, it } from 'vitest';
import {
  caregiverLine,
  dueText,
  moneyText,
  patientError,
  patientMessage,
  shortDate,
  sourceText,
  summaryLine,
  tableRows,
  utilityLabel,
  type CaregiverScan,
  type PatientScan,
} from '../../ui/model';
import { UTILITIES } from '@core/ai/documents';

const scan = (over: Partial<PatientScan> = {}): PatientScan => ({
  id: 'x',
  createdAt: '2026-10-24T12:00:00Z',
  outcome: 'read',
  utility: 'water',
  payee: 'Fictional Water Co',
  amountCents: 3150,
  dueDate: '2026-11-20',
  dueInDays: 27,
  ...over,
});

describe('table', () => {
  it('has the three rows in very simple words', () => {
    expect(tableRows(scan())).toEqual([
      { label: 'What it is', value: 'Water bill from Fictional Water Co' },
      { label: 'How much', value: '$31.50' },
      { label: 'Pay by', value: 'Nov 20 (in 27 days)' },
    ]);
  });
  it('says so when something is not on the bill, never a guess', () => {
    const rows = tableRows(scan({ payee: '', amountCents: null, dueDate: null, dueInDays: null }));
    expect(rows[0]!.value).toBe('Water bill');
    expect(rows[1]!.value).toMatch(/not shown/i);
    expect(rows[2]!.value).toMatch(/not shown/i);
  });
  it('every utility has a label', () => {
    for (const u of UTILITIES) expect(utilityLabel(u).length).toBeGreaterThan(2);
  });
});

describe('dates and money', () => {
  it('formats without any timezone shift', () => {
    expect(shortDate('2026-11-20')).toBe('Nov 20');
    expect(shortDate('2026-01-05')).toBe('Jan 5');
    expect(moneyText(8412)).toBe('$84.12');
    expect(moneyText(5)).toBe('$0.05');
  });
  it('says today, tomorrow, soon and (plainly) late', () => {
    expect(dueText('2026-10-24', 0)).toBe('Oct 24 (today)');
    expect(dueText('2026-10-25', 1)).toBe('Oct 25 (tomorrow)');
    expect(dueText('2026-10-23', -1)).toBe('Oct 23 (yesterday: already late)');
    expect(dueText('2026-10-20', -4)).toBe('Oct 20 (4 days ago: already late)');
  });
});

describe('patient wording', () => {
  it('a clear bill never tells them to pay, and says nothing was paid', () => {
    expect(summaryLine(scan())).toBe('This water bill says you owe $31.50, to pay by Nov 20.');
    expect(`${summaryLine(scan())} ${JSON.stringify(patientMessage(scan()))}`).not.toMatch(
      /you should pay|pay it now|go ahead/i,
    );
    expect(patientMessage(scan()).body).toMatch(/nothing has been paid/i);
  });
  it('a bill with warning signs says don’t pay yet and show the caregiver', () => {
    const m = patientMessage(scan({ outcome: 'flagged' }));
    expect(m.title).toMatch(/don.t pay/i);
    expect(m.body).toMatch(/caregiver/i);
  });
  it('an unreadable picture says so and offers a way forward', () => {
    const m = patientMessage(scan({ outcome: 'unclear' }));
    expect(m.title).toMatch(/could not read/i);
    expect(m.body).toMatch(/light|caregiver/i);
  });
  it('has no digits-as-codes, jargon or error words in patient errors', () => {
    const all = ['offline', 'bad_image', 'too_large', 'too_many', 'weird']
      .map(patientError)
      .join(' ');
    expect(all).not.toMatch(/\d|error|code|http|invalid/i);
  });
  it('summary copes with a missing amount or date', () => {
    expect(summaryLine(scan({ dueDate: null }))).toMatch(/could not see a date/);
    expect(summaryLine(scan({ amountCents: null }))).toMatch(/could not see the amount/);
    expect(summaryLine(scan({ amountCents: null, dueDate: null }))).toMatch(
      /could not see the amount or the date/,
    );
  });
});

describe('caregiver wording', () => {
  const cg = (over: Partial<CaregiverScan> = {}): CaregiverScan => ({
    ...scan(),
    redFlags: [],
    confidence: 0.9,
    source: 'ai',
    ...over,
  });
  it('one line per scan, and honest about where the reading came from', () => {
    expect(caregiverLine(cg())).toBe(
      'Water bill from Fictional Water Co: $31.50, pay by Nov 20 (in 27 days)',
    );
    expect(caregiverLine(cg({ outcome: 'unclear' }))).toMatch(/could not read/i);
    expect(caregiverLine(cg({ amountCents: null, dueDate: null, dueInDays: null }))).toBe(
      'Water bill from Fictional Water Co: amount not shown, no pay-by date shown',
    );
    expect(sourceText('ai', 'read')).toBe('Read by AI');
    expect(sourceText('sample', 'read')).toBe('Demo sample');
    expect(sourceText('ai', 'unclear')).toMatch(/could not read/i);
  });
});
