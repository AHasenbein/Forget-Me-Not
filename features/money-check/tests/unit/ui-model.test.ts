import { describe, expect, it } from 'vitest';
import { REASONS } from '../../schemas';
import {
  caregiverError,
  caregiverReason,
  dollars,
  levelTone,
  patientError,
  patientReason,
  patientStatusText,
} from '../../ui/model';

describe('patient wording', () => {
  it('never says "told/asked your caregiver" unless a push was delivered', () => {
    expect(patientStatusText('no_one_reachable').body).not.toMatch(/asked your caregiver/i);
    expect(patientStatusText('waiting').body).toMatch(/asked your caregiver/i);
  });
  it('always tells the patient not to pay until the caregiver says OK', () => {
    for (const s of ['waiting', 'no_one_reachable', 'dont_pay'] as const)
      expect(JSON.stringify(patientStatusText(s))).toMatch(/don.t pay/i);
    expect(patientStatusText('ok_to_go').title).toMatch(/caregiver says/i);
    // an auto-cleared payment must NOT claim the caregiver said so
    expect(JSON.stringify(patientStatusText('looks_ok'))).not.toMatch(/caregiver says|don.t pay/i);
    expect(patientStatusText('looks_ok').title).toMatch(/looks OK/i);
  });
  it('has no digits, codes or money in any patient text', () => {
    const all = [
      ...(['waiting', 'no_one_reachable', 'ok_to_go', 'looks_ok', 'dont_pay'] as const).map((s) =>
        JSON.stringify(patientStatusText(s)),
      ),
      ...REASONS.map((r) => patientReason([r]) ?? ''),
      patientError('offline'),
      patientError('x'),
    ].join(' ');
    expect(all).not.toMatch(/\d|\$|error|code|http/i);
  });
  it('explains the scam reasons in one calm sentence', () => {
    expect(patientReason(['gift_card_payment'])).toMatch(/never paid with gift cards/i);
    expect(patientReason(['known_bill'])).toBeNull();
  });
});

describe('looks-OK timing', () => {
  it('stays 5 s, and a tap only counts after 1 s', async () => {
    const { LOOKS_OK_MS, LOOKS_OK_TAP_AFTER_MS } = await import('../../ui/model');
    expect(LOOKS_OK_MS).toBe(5000);
    expect(LOOKS_OK_TAP_AFTER_MS).toBe(1000);
  });
});

describe('caregiver wording', () => {
  it('has an explanation for every reason', () => {
    for (const r of REASONS) expect(caregiverReason(r).length).toBeGreaterThan(10);
  });
  it('maps levels to tones and formats dollars', () => {
    expect(levelTone('stop')).toBe('danger');
    expect(levelTone('check')).toBe('warn');
    expect(levelTone('ok')).toBe('primary');
    expect(dollars(3150)).toBe('$31.50');
  });
  it('explains expiry as a decline, not an error', () => {
    expect(caregiverError('expired')).toMatch(/declined/);
    expect(caregiverError('already_decided')).toMatch(/already answered/i);
  });
});
