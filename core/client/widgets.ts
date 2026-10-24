import type { Role } from '@contracts/circle';
import { isDemo } from '../config/data-mode';
import { manifests } from '../feature-registry/registry.generated';
import { uis } from '../feature-registry/ui-registry.generated';
import type { Widget } from '../feature-registry/ui';

/** Features shown in the app: everything in demo mode, else only those enabled by default (client flags: Stage 2). */
const featureOn = (name: string, demo: boolean) =>
  demo ||
  process.env.EXPO_PUBLIC_FEATURE_ALL === 'on' || // literal access so Expo inlines it
  manifests.find((m) => m.name === name)?.enabledByDefault === true;

export function widgetsFor(role: Role, demo = isDemo()): Widget[] {
  return Object.entries(uis)
    .filter(([name]) => featureOn(name, demo))
    .flatMap(([, ui]) => ui.widgets)
    .filter((w) => w.role === role)
    .sort((a, b) => a.order - b.order);
}
