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
  Component: ComponentType<WidgetProps>;
}

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

/** Entry point of `features/<name>/ui/index.tsx`. Never imported by manifest.ts (the server must not load React Native). */
export interface FeatureUi {
  widgets: readonly Widget[];
}
export const defineFeatureUi = (u: FeatureUi): FeatureUi => u;
