import { describe, expect, it } from 'vitest';
import type { Widget } from '../feature-registry/ui';
import { dashboardItems } from './widget-groups';

const w = (id: string, order: number, group?: Widget['group']): Widget => ({
  id,
  role: 'patient',
  order,
  group,
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
