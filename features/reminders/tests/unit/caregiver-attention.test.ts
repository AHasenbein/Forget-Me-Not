import { describe, expect, it } from 'vitest';
import { attentionReport, caregiverRows, type OccurrenceView } from '../../ui/model';

const occ = (
  id: string,
  kind: OccurrenceView['kind'],
  phase: OccurrenceView['phase'],
  verification?: 'pending_review' | 'rejected',
): OccurrenceView =>
  ({
    id,
    kind,
    phase,
    status: phase === 'confirmed' ? 'confirmed' : 'pending',
    dueAt: '2026-10-25T08:00:00.000Z',
    timeZone: 'UTC',
    snoozeCount: 0,
    confirmation: verification
      ? { at: '2026-10-25T08:01:00.000Z', method: 'tap', verification }
      : null,
  }) as unknown as OccurrenceView;

const rows = (items: OccurrenceView[]) => caregiverRows(items, () => '8:00');

describe('attentionReport (caregiver dashboard status line)', () => {
  it('reports nothing open when the day is on track', () => {
    expect(attentionReport(rows([occ('a', 'pill', 'confirmed')]), false)).toEqual({
      count: 0,
      severity: 'warning',
      what: undefined,
      unknown: undefined,
    });
  });

  it('makes a missed pill urgent', () => {
    expect(attentionReport(rows([occ('a', 'pill', 'missed')]), false)).toMatchObject({
      count: 1,
      severity: 'urgent',
      what: 'Pill missed',
    });
  });

  it('keeps a missed shower a warning, and counts photo reviews too', () => {
    const r = attentionReport(
      rows([occ('a', 'shower', 'missed'), occ('b', 'pill', 'confirmed', 'pending_review')]),
      false,
    );
    expect(r).toMatchObject({ count: 2, severity: 'warning' });
    expect(r.what).toBe('Shower missed · Pill photos to check');
  });

  it('makes photos that look wrong urgent', () => {
    expect(attentionReport(rows([occ('a', 'pill', 'confirmed', 'rejected')]), false).severity).toBe(
      'urgent',
    );
  });

  it('says what it could not check when the refresh failed', () => {
    expect(attentionReport([], true).unknown).toBe('reminders');
  });
});
