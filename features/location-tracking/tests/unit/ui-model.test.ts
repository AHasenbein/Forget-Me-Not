import { describe, expect, it } from 'vitest';
import { caregiverError, lastSeenLine, mapsUrl, viewLabel, viewTime } from '../../ui/model';

describe('lastSeenLine', () => {
  const fmt = () => '8:14 PM';
  it('says plainly when nothing was shared', () => {
    expect(lastSeenLine(null, fmt)).toBe('No location has been shared yet.');
  });
  it('is always "last seen", never "now"', () => {
    const t = lastSeenLine({ recordedAt: 'x', accuracyM: 11.6, stale: false }, fmt);
    expect(t).toBe('Last seen at 8:14 PM (within about 12 m).');
    expect(t).not.toMatch(/\bnow\b/i);
  });
  it('warns when the reading is stale', () => {
    expect(lastSeenLine({ recordedAt: 'x', accuracyM: 5, stale: true }, fmt)).toMatch(/old/);
  });
});

describe('viewLabel', () => {
  it('names the kind of viewer, never an id', () => {
    expect(viewLabel({ purpose: 'caregiver_view', outcome: 'served' })).toBe('Caregiver looked');
    expect(viewLabel({ purpose: 'circle_view', outcome: 'served' })).toBe('Family member looked');
    expect(viewLabel({ purpose: 'lost_button', outcome: 'served' })).toBe(
      'Lost-button alert looked',
    );
  });
  it('flags blocked attempts and empty reads', () => {
    expect(viewLabel({ purpose: 'circle_view', outcome: 'denied' })).toMatch(/blocked/);
    expect(viewLabel({ purpose: 'caregiver_view', outcome: 'no_data' })).toMatch(/nothing to show/);
  });
  it('falls back safely for an unknown purpose', () => {
    expect(viewLabel({ purpose: 'something_new', outcome: 'served' })).toBe('Someone looked');
  });
});

describe('viewTime / mapsUrl / caregiverError', () => {
  it('shows date and time in the zone', () => {
    expect(viewTime('2026-06-02T20:12:00Z', 'UTC')).toBe('Jun 2, 8:12 PM');
  });
  it('builds a maps link', () => {
    expect(mapsUrl(40.7128, -74.006)).toBe(
      'https://www.google.com/maps/search/?api=1&query=40.71280,-74.00600',
    );
  });
  it('maps offline to plain words', () => {
    expect(caregiverError('offline')).toMatch(/server/);
    expect(caregiverError('x')).toMatch(/didn’t work/);
  });
});
