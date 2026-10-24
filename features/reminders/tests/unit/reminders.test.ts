import { describe, expect, it } from 'vitest';
import manifest from '../../manifest';

describe('manifest contract', () => {
  it('matches the folder, ships flagged off, and every route declares access', () => {
    expect(manifest.name).toBe('reminders');
    expect(manifest.enabledByDefault).toBe(false);
    for (const r of manifest.routes) expect(r.access).toBeDefined();
  });
  it('never lets circle members in (no route lists circle_member)', () => {
    for (const r of manifest.routes)
      expect(
        'roles' in r.access && (r.access.roles as readonly string[]).includes('circle_member'),
      ).toBe(false);
  });
  it('declares a demoSeed (every feature with user-visible data must)', () => {
    expect(manifest.demoSeed).toBeTypeOf('function');
  });
});
