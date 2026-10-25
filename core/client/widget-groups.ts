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
  { id: 'messages', label: 'Messages' },
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

/** One box of the wide-screen grid: a section, how many columns it spans, and sections drawn inside it. */
export interface GridCell {
  id: DashboardSection;
  span: number;
  /** Shown inside this box instead of in a box of their own ("Worth knowing" lives in the "needs you" box). */
  with?: readonly DashboardSection[];
}

/**
 * Wide-screen dashboard, top to bottom: `top` spans the full width (the stats strip); then a grid of boxes in reading
 * order: two rows of three (Today, Reminders, Location / Needs you, Messages, This week). The "needs you" box holds
 * "Worth knowing" too. Every box in a row is as tall as the tallest one, so the bottoms line up. Every section appears
 * exactly once (tested).
 */
export const DASHBOARD_LAYOUT: { top: readonly DashboardSection[]; cells: readonly GridCell[] } = {
  top: ['summary'],
  cells: [
    { id: 'today', span: 1 },
    { id: 'manage', span: 1 },
    { id: 'where', span: 1 },
    { id: 'alerts', span: 1, with: ['activity'] },
    { id: 'messages', span: 1 },
    { id: 'week', span: 1 },
  ],
};

/**
 * Rows for a given number of columns, each row full: boxes in reading order, but a wide box that does not fit the rest
 * of a row waits for the next one while a later narrow box fills the gap. Today every box is one column wide, so this is
 * simply rows of `columns` boxes in reading order.
 */
export function rowsFor(columns: number): GridCell[][] {
  const n = Math.max(1, columns);
  const queue = DASHBOARD_LAYOUT.cells.map((c) => ({ ...c, span: Math.min(c.span, n) }));
  const rows: GridCell[][] = [];
  while (queue.length) {
    const row: GridCell[] = [];
    let free = n;
    for (let i = 0; i < queue.length && free > 0;) {
      if (queue[i]!.span <= free) {
        free -= queue[i]!.span;
        row.push(queue.splice(i, 1)[0]!);
      } else i++;
    }
    rows.push(row);
  }
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
