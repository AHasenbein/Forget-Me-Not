import type { Widget, WidgetGroup } from '../feature-registry/ui';

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
