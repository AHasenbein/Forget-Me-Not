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
  Component: ComponentType;
}

/** Entry point of `features/<name>/ui/index.tsx`. Never imported by manifest.ts (the server must not load React Native). */
export interface FeatureUi {
  widgets: readonly Widget[];
}
export const defineFeatureUi = (u: FeatureUi): FeatureUi => u;
