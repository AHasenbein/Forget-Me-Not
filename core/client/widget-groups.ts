import type { Attention, DashboardSection, Widget, WidgetGroup } from '../feature-registry/ui';

/** Label of the one button a group shows on the dashboard. */
export const WIDGET_GROUPS: Record<WidgetGroup, string> = { 'before-i-pay': 'Before I pay' };

export type DashboardItem =
  { kind: 'widget'; widget: Widget } | { kind: 'group'; group: WidgetGroup; members: Widget[] };

/** Collapse grouped widgets into one item placed where the group's first member sits. Input must be sorted by order. */
export function dashboardItems(widgets: Widget[]): DashboardItem[] {
  const items: DashboardItem[] = [];
  const groups = new Map<WidgetGroup, Widget[]>();
  for (const widget of widgets) {
    if (!widget.group) {
      items.push({ kind: 'widget', widget });
      continue;
    }
    let members = groups.get(widget.group);
    if (!members) {
      members = [];
      groups.set(widget.group, members);
      items.push({ kind: 'group', group: widget.group, members });
    }
    members.push(widget);
  }
  return items;
}

/**
 * The caregiver dashboard tiles, in priority order: what needs you first, then today, then reference panels. Phones
 * stack them in exactly this order. `alerts` is the "needs you now" row; `summary` is the stats strip.
 */
export const SECTIONS: readonly { id: DashboardSection; label: string }[] = [
  { id: 'alerts', label: 'Needs you now' },
  { id: 'summary', label: 'Summary' },
  { id: 'today', label: 'Today' },
  { id: 'activity', label: 'Worth knowing' },
  { id: 'manage', label: 'Reminders' },
  { id: 'where', label: 'Location' },
  { id: 'week', label: 'Week' },
];

/** Bucket widgets into the dashboard tiles (by `order` inside each). Unsectioned widgets go to "Today". */
export function bySection(widgets: Widget[]) {
  return SECTIONS.map((sec) => ({
    ...sec,
    widgets: widgets
      .filter((w) => (w.section ?? 'today') === sec.id)
      .sort((a, b) => a.order - b.order),
  })).filter((sec) => sec.widgets.length > 0);
}

/**
 * Wide-screen dashboard, top to bottom: `top` spans the full width (the stats strip); then a grid of boxes, row by
 * row. Every box in a row is as tall as the tallest one, so the bottoms line up. "Worth knowing" sits under Today,
 * the "needs you" box (status + alerts) under Reminders. Every section appears exactly once (tested).
 */
export const DASHBOARD_LAYOUT: {
  top: readonly DashboardSection[];
  grid: readonly (readonly DashboardSection[])[];
} = {
  top: ['summary'],
  grid: [
    ['today', 'manage', 'where'],
    ['activity', 'alerts', 'week'],
  ],
};

/** The grid for a given number of columns: the boxes in reading order, re-cut into rows of that width. */
export function rowsFor(columns: number): DashboardSection[][] {
  const cells = DASHBOARD_LAYOUT.grid.flat();
  const n = Math.max(1, columns);
  const rows: DashboardSection[][] = [];
  for (let i = 0; i < cells.length; i += n) rows.push(cells.slice(i, i + n));
  return rows;
}

/** What a widget has told the shell so far: `checking` until its first load finishes. */
export type AttentionReport = Attention | 'checking';

export interface DashboardStatus {
  tone: 'danger' | 'warn' | 'success' | 'neutral';
  title: string;
  detail: string;
}

const things = (n: number) => (n === 1 ? '1 thing needs you' : `${n} things need you`);

/**
 * The one line at the top of the caregiver dashboard. It must never say "all clear" while something is open, still
 * loading, or could not be checked: no update is never proof that all is well.
 */
export function dashboardStatus(reports: readonly AttentionReport[]): DashboardStatus {
  const known = reports.filter((r): r is Attention => r !== 'checking');
  const open = known.filter((r) => r.count > 0);
  const total = open.reduce((n, r) => n + r.count, 0);
  const unknown = known.flatMap((r) => (r.unknown ? [r.unknown] : []));
  const cantCheck = unknown.length ? `Can’t check right now: ${unknown.join(', ')}.` : '';
  if (total > 0) {
    const urgent = open.some((r) => r.severity === 'urgent');
    // Urgent first, so the most important thing is the first thing read.
    const what = [...open]
      .sort((a, b) => Number(b.severity === 'urgent') - Number(a.severity === 'urgent'))
      .flatMap((r) => (r.what ? [r.what] : []));
    return {
      tone: urgent ? 'danger' : 'warn',
      title: urgent ? `${things(total)} now` : things(total),
      detail: [what.join(' · '), cantCheck].filter(Boolean).join(' '),
    };
  }
  if (unknown.length)
    return {
      tone: 'warn',
      title: 'Can’t check everything right now',
      detail: `${cantCheck} This is not an all-clear.`,
    };
  if (reports.length === 0 || known.length < reports.length)
    return { tone: 'neutral', title: 'Checking…', detail: '' };
  return { tone: 'success', title: 'All clear', detail: 'Nothing needs you right now.' };
}
