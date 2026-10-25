import { describe, expect, it } from 'vitest';
import type { Widget } from '../feature-registry/ui';
import {
  bySection,
  DASHBOARD_LAYOUT,
  dashboardItems,
  dashboardStatus,
  rowsFor,
  SECTIONS,
  type GridCell,
} from './widget-groups';

const w = (
  id: string,
  order: number,
  group?: Widget['group'],
  section?: Widget['section'],
): Widget => ({
  id,
  role: 'patient',
  order,
  group,
  section,
  Component: () => null,
});

describe('dashboardItems', () => {
  it('keeps ungrouped widgets as they are', () => {
    const items = dashboardItems([w('a', 1), w('b', 2)]);
    expect(items.map((i) => i.kind)).toEqual(['widget', 'widget']);
  });

  it('collapses grouped widgets into one item where the first member sits', () => {
    const items = dashboardItems([
      w('a', 1),
      w('check', 20, 'before-i-pay'),
      w('c', 22),
      w('bill', 25, 'before-i-pay'),
    ]);
    expect(items.map((i) => i.kind)).toEqual(['widget', 'group', 'widget']);
    const group = items[1];
    expect(group?.kind === 'group' && group.members.map((m) => m.id)).toEqual(['check', 'bill']);
  });
});

describe('bySection', () => {
  it('orders sections top to bottom, sorts by order inside, defaults to today', () => {
    const out = bySection([
      w('graph', 5, undefined, 'week'),
      w('lost', 2, undefined, 'alerts'),
      w('hero', 9),
      w('hero-first', 1, undefined, 'today'),
    ]);
    expect(out.map((s) => s.id)).toEqual(['alerts', 'today', 'week']);
    expect(out[1]?.widgets.map((x) => x.id)).toEqual(['hero-first', 'hero']);
  });

  it('leaves out sections with no widgets', () => {
    expect(bySection([w('a', 1, undefined, 'activity')]).map((s) => s.id)).toEqual(['activity']);
  });

  it('puts what needs you first, so phones show alerts before anything else', () => {
    expect(SECTIONS[0]?.id).toBe('alerts');
  });
});

describe('DASHBOARD_LAYOUT', () => {
  const ids = (rows: GridCell[][]) => rows.map((r) => r.map((c) => c.id));

  it('places every section exactly once ("Worth knowing" inside the "needs you" box)', () => {
    const placed = [
      ...DASHBOARD_LAYOUT.top,
      ...rowsFor(3)
        .flat()
        .flatMap((c) => [c.id, ...(c.with ?? [])]),
    ];
    expect([...placed].sort()).toEqual(SECTIONS.map((s) => s.id).sort());
  });

  it('3 columns: two full rows, the "needs you" box two columns wide', () => {
    expect(ids(rowsFor(3))).toEqual([
      ['today', 'manage', 'where'],
      ['alerts', 'week'],
    ]);
    expect(rowsFor(3)[1]?.[0]).toMatchObject({ id: 'alerts', span: 2, with: ['activity'] });
  });

  it('every row is full at any width (a later narrow box fills a gap, order otherwise kept)', () => {
    expect(ids(rowsFor(2))).toEqual([['today', 'manage'], ['where', 'week'], ['alerts']]);
    for (const n of [1, 2, 3, 4, 5]) {
      const rows = rowsFor(n);
      const full = Math.min(
        n,
        DASHBOARD_LAYOUT.cells.reduce((t, c) => t + Math.min(c.span, n), 0),
      );
      for (const r of rows.slice(0, -1)) expect(r.reduce((t, c) => t + c.span, 0)).toBe(full);
      expect(rows.flat()).toHaveLength(DASHBOARD_LAYOUT.cells.length);
    }
    expect(rowsFor(1)).toHaveLength(5);
  });
});

describe('dashboardStatus', () => {
  it('is all clear only when every widget reported nothing open', () => {
    expect(dashboardStatus([{ count: 0 }, { count: 0 }])).toMatchObject({
      tone: 'success',
      title: 'All clear',
    });
  });

  it('says checking while a widget has not loaded yet, never all clear', () => {
    expect(dashboardStatus([{ count: 0 }, 'checking']).title).toBe('Checking…');
    expect(dashboardStatus([]).title).toBe('Checking…');
  });

  it('counts open items and lists urgent ones first', () => {
    const s = dashboardStatus([
      { count: 2, severity: 'warning', what: '2 missed reminders' },
      { count: 1, severity: 'urgent', what: 'They pressed “I’m lost”' },
    ]);
    expect(s).toMatchObject({ tone: 'danger', title: '3 things need you now' });
    expect(s.detail).toBe('They pressed “I’m lost” · 2 missed reminders');
  });

  it('is a warning, not urgent, when nothing open is urgent', () => {
    expect(dashboardStatus([{ count: 1, severity: 'warning' }])).toMatchObject({
      tone: 'warn',
      title: '1 thing needs you',
    });
  });

  it('never reads a failed widget as all clear', () => {
    const s = dashboardStatus([{ count: 0 }, { count: 0, unknown: 'phone calls' }]);
    expect(s.tone).toBe('warn');
    expect(s.title).not.toMatch(/clear/i);
    expect(s.detail).toContain('phone calls');
  });

  it('keeps open items first and still says what could not be checked', () => {
    const s = dashboardStatus([
      { count: 1, severity: 'urgent', what: 'A payment to check' },
      { count: 0, unknown: 'bills' },
    ]);
    expect(s.tone).toBe('danger');
    expect(s.detail).toContain('Can’t check right now: bills.');
  });
});
