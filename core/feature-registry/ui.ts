import type { ComponentType } from 'react';
import type { Role } from '@contracts/circle';

/**
 * A dashboard widget contributed by a feature. The shell renders widgets for the signed-in role, sorted
 * by `order`. Patient widgets must follow the patient UI rules (one primary action on screen).
 */
export interface Widget {
  id: string;
  role: Role;
  order: number;
  /** Optional: shown behind one shared button (see `WIDGET_GROUPS` in core/client/widgets.ts) instead of on the dashboard. */
  group?: WidgetGroup;
  /** Caregiver one-page layout: which section the widget sits in (default 'today'). */
  section?: DashboardSection;
  Component: ComponentType<WidgetProps>;
}

/**
 * Tiles of the caregiver dashboard (labels, order and layout: core/client/widget-groups.ts). `alerts` and `activity`
 * are drawn by the shell: one "Needs you" box with "Worth knowing" (`activity`) at its foot; `activity` widgets render
 * plain lines, no Card of their own.
 */
export type DashboardSection =
  'summary' | 'alerts' | 'today' | 'manage' | 'week' | 'where' | 'activity';

/** Groups let features share one button without importing each other (e.g. money-check + bill-reader behind "Before I pay"). */
export type WidgetGroup = 'before-i-pay';

/**
 * `collapsed` is true while the group's button is closed. A grouped widget then renders only what must stay visible
 * (e.g. a "don't pay yet" message) and nothing else; its own sub-button shows only when the group is open.
 */
export interface WidgetProps {
  collapsed?: boolean;
  /** Call on typing so the group does not fold away mid-sentence. */
  onActivity?: () => void;
}

/**
 * What a caregiver widget tells the dashboard's status line (via `useAttention` in core/client/attention.ts), so the
 * shell can say "2 things need you now" without knowing any feature. Plain words only: no names, amounts or places.
 */
export interface Attention {
  /** How many things need the caregiver (0 = nothing from this widget). */
  count: number;
  /** `urgent` = act now (lost, scam in progress, "don't pay"); `warning` = look soon. */
  severity?: 'urgent' | 'warning';
  /** Short words for the status line, e.g. "They pressed “I’m lost”". */
  what?: string;
  /** Set when the widget could not load: what it could not check, e.g. "phone calls". Never read as all-clear. */
  unknown?: string;
}

/** Entry point of `features/<name>/ui/index.tsx`. Never imported by manifest.ts (the server must not load React Native). */
export interface FeatureUi {
  widgets: readonly Widget[];
}
export const defineFeatureUi = (u: FeatureUi): FeatureUi => u;
