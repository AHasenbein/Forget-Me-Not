import { describe, expect, it } from 'vitest';
import { findBoundaryViolations, readSources } from './helpers';

describe('feature boundaries', () => {
  it('no feature imports another feature’s internals; shared code does not import features', () => {
    const files = [...readSources('features'), ...readSources('core'), ...readSources('contracts')];
    expect(findBoundaryViolations(files)).toEqual([]);
  });

  describe('detector self-test (proves the rule is not vacuous)', () => {
    const f = (path: string, content: string) => ({ path, content });
    it('flags @features alias imports', () => {
      expect(
        findBoundaryViolations([f('features/a/x.ts', "import { y } from '@features/b/service';")]),
      ).toHaveLength(1);
    });
    it('flags relative imports into a sibling feature', () => {
      expect(
        findBoundaryViolations([f('features/a/x.ts', "import { y } from '../b/service';")]),
      ).toHaveLength(1);
    });
    it('allows imports inside the same feature and via @core/@contracts', () => {
      expect(
        findBoundaryViolations([
          f(
            'features/a/x.ts',
            "import { y } from './sub/y'; import z from '@core/events/bus'; import c from '@contracts/events';",
          ),
        ]),
      ).toEqual([]);
    });
    it('flags core importing a feature', () => {
      expect(
        findBoundaryViolations([f('core/auth/x.ts', "import m from '@features/a/manifest';")]),
      ).toHaveLength(1);
    });
  });
});
