import { describe, expect, it } from 'vitest';
import {
  caregiverError,
  lastSeenLine,
  mapsUrl,
  notableLine,
  viewLabel,
  viewTime,
  worthKnowing,
  type ViewRow,
} from '../../ui/model';

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

describe('worthKnowing (dashboard "Worth knowing" box)', () => {
  const row = (purpose: string, outcome: ViewRow['outcome'], byYou: boolean, at: string) => ({
    id: `${purpose}-${at}`,
    purpose,
    outcome,
    byYou,
    at,
  });

  it('leaves out your own looks and automatic lost-button reads; groups the rest', () => {
    const rows = [
      row('lost_button', 'served', false, '2026-10-25T10:05:00Z'),
      row('caregiver_view', 'served', true, '2026-10-25T10:04:00Z'),
      row('circle_view', 'served', false, '2026-10-25T10:03:00Z'),
      row('circle_view', 'no_data', false, '2026-10-25T09:00:00Z'),
      row('find_session', 'served', true, '2026-10-25T08:00:00Z'),
    ];
    expect(worthKnowing(rows)).toEqual([
      {
        key: 'circle',
        text: 'A family member looked at the location',
        count: 2,
        lastAt: '2026-10-25T10:03:00Z',
      },
    ]);
  });

  it('a blocked attempt always shows, first, even when it was your own session', () => {
    const rows = [
      row('circle_view', 'served', false, '2026-10-25T10:03:00Z'),
      row('caregiver_view', 'denied', true, '2026-10-25T09:00:00Z'),
    ];
    const [first] = worthKnowing(rows);
    expect(first).toMatchObject({ key: 'denied', tone: 'danger', count: 1 });
  });

  it('another caregiver looking or starting Find is worth knowing', () => {
    const keys = worthKnowing([
      row('caregiver_view', 'served', false, '2026-10-25T10:00:00Z'),
      row('find_session', 'served', false, '2026-10-25T09:00:00Z'),
    ]).map((n) => n.key);
    expect(keys).toEqual(['caregiver', 'find']);
  });

  it('nothing from others: empty (the widget says "no one else looked")', () => {
    expect(worthKnowing([row('caregiver_view', 'served', true, '2026-10-25T10:00:00Z')])).toEqual(
      [],
    );
  });

  it('plain one-line wording, count only when repeated, no ids or coordinates', () => {
    const fmt = () => 'Oct 25, 10:03 AM';
    const base = { key: 'circle', text: 'A family member looked at the location', lastAt: 'x' };
    expect(notableLine({ ...base, count: 1 }, fmt)).toBe(
      'A family member looked at the location. Last: Oct 25, 10:03 AM.',
    );
    expect(notableLine({ ...base, count: 3 }, fmt)).toBe(
      'A family member looked at the location (3 times). Last: Oct 25, 10:03 AM.',
    );
  });
});
