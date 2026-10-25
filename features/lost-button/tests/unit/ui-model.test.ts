import { describe, expect, it } from 'vitest';
import {
  alertPollMs,
  caregiverError,
  deliveryLine,
  lastSeenLine,
  mapsUrl,
  patientError,
  patientStatusText,
  POLL_ALERT_MS,
  POLL_IDLE_MS,
} from '../../ui/model';

describe('patientStatusText', () => {
  it('only says "told" when a push was delivered', () => {
    expect(patientStatusText('notified').title).toMatch(/has been told/);
    expect(patientStatusText('no_one_reachable').title).not.toMatch(/has been told/);
    expect(patientStatusText('no_one_reachable').title).toMatch(/still trying/);
  });
  it('says on the way after acknowledge', () => {
    expect(patientStatusText('on_the_way').title).toMatch(/on the way/);
  });
  it('never contains a code, coordinates or a name', () => {
    for (const s of ['notified', 'no_one_reachable', 'on_the_way'] as const) {
      const t = patientStatusText(s);
      expect(`${t.title} ${t.body}`).not.toMatch(/[0-9]|_|error|Margaret/i);
    }
  });
});

describe('errors', () => {
  it('patient errors are plain words', () => {
    expect(patientError('offline')).toMatch(/can’t reach/);
    expect(patientError('401')).toBe('That didn’t work. Please try again.');
  });
  it('caregiver errors explain a closed alert', () => {
    expect(caregiverError('resolved')).toMatch(/already closed/);
    expect(caregiverError('expired')).toMatch(/already closed/);
    expect(caregiverError('offline')).toMatch(/server/);
  });
});

describe('alertPollMs (audit-log flood guard)', () => {
  it('polls fast only when no alert is open, because that path reads no location', () => {
    expect(alertPollMs(false)).toBe(POLL_IDLE_MS);
    expect(alertPollMs(true)).toBe(POLL_ALERT_MS);
    expect(POLL_ALERT_MS).toBeGreaterThanOrEqual(30_000);
  });
});

describe('lastSeenLine', () => {
  const fmt = () => '8:14 PM';
  it('says plainly when there is no location', () => {
    expect(lastSeenLine(null, fmt)).toBe('No location has been shared yet.');
  });
  it('labels a fresh reading as last seen, never "now"', () => {
    const t = lastSeenLine({ recordedAt: 'x', accuracyM: 19.6, stale: false }, fmt);
    expect(t).toBe('Last seen at 8:14 PM (within about 20 m).');
    expect(t).not.toMatch(/\bnow\b/i);
  });
  it('warns when stale', () => {
    expect(lastSeenLine({ recordedAt: 'x', accuracyM: 10, stale: true }, fmt)).toMatch(/old/);
  });
});

describe('deliveryLine / mapsUrl', () => {
  it('says whether the phone was reached', () => {
    expect(deliveryLine({ delivered: true, attempts: 1 })).toMatch(/notified/);
    expect(deliveryLine({ delivered: false, attempts: 3 })).toMatch(/could not reach/);
  });
  it('builds a maps link with rounded coordinates', () => {
    expect(mapsUrl(51.50735, -0.12776)).toBe(
      'https://www.google.com/maps/search/?api=1&query=51.50735,-0.12776',
    );
  });
});
