import { describe, expect, it, vi } from 'vitest';
import { dataMode } from '../config/data-mode';
import { defineFeature } from '../feature-registry/manifest';
import { getProviders, registerLive } from '../providers';
import { buildDemoWorld, seedDemo } from '.';

describe('data mode', () => {
  it('defaults to demo outside production and live in production', () => {
    expect(dataMode('data', { NODE_ENV: 'test' })).toBe('demo');
    expect(dataMode('data', { NODE_ENV: 'production' })).toBe('live');
  });
  it('demo in production needs an explicit opt-in; bad values throw', () => {
    expect(() => dataMode('data', { NODE_ENV: 'production', DATA_MODE: 'demo' })).toThrow(
      /ALLOW_DEMO/,
    );
    expect(
      dataMode('data', {
        NODE_ENV: 'production',
        DATA_MODE: 'demo',
        ALLOW_DEMO_IN_PRODUCTION: 'true',
      }),
    ).toBe('demo');
    expect(() => dataMode('data', { DATA_MODE: 'fake' })).toThrow(/demo" or "live/);
  });
  it('per-service override beats the global mode', () => {
    expect(dataMode('ai', { DATA_MODE: 'demo', DATA_MODE_AI: 'live' })).toBe('live');
    expect(dataMode('plaid', { DATA_MODE: 'demo', DATA_MODE_AI: 'live' })).toBe('demo');
  });
});

describe('demo world + providers', () => {
  const world = buildDemoWorld(new Date('2026-06-01T12:00:00Z'));
  it('is deterministic and relative to now', () => {
    expect(buildDemoWorld(world.now)).toEqual(world);
    expect(world.location.lastKnown.recordedAt).toBe('2026-06-01T11:58:00.000Z');
  });
  it('demo providers: location honours grants, verifier switches roles', async () => {
    const p = getProviders({ env: { DATA_MODE: 'demo' }, world });
    const req = (requesterId: string) => ({
      patientId: world.patient.id,
      requesterId,
      purpose: 'circle_view' as const,
    });
    expect(await p.location.getLastKnown(req(world.daughter.id))).not.toBeNull();
    expect(await p.location.getLastKnown(req(world.friend.id))).toBeNull(); // no grant => fail closed
    expect((await p.verifier.verify('demo:caregiver'))?.role).toBe('primary_caregiver');
    expect(await p.verifier.verify('demo:nobody')).toBeNull();
    expect((await p.plaid.listTransactions(world.patient.id)).some((b) => !b.paid)).toBe(true);
  });
  it('live mode never falls back to canned data and never exposes the demo verifier', () => {
    expect(() => getProviders({ env: { DATA_MODE: 'live' }, world })).toThrow(/No live/);
    const verifier = { verify: async () => null };
    registerLive('verifier', verifier);
    const mixed = getProviders({ env: { DATA_MODE: 'demo', DATA_MODE_NOTIFIER: 'demo' }, world });
    expect(mixed.verifier).not.toBe(verifier); // demo mode => demo verifier
  });
});

describe('seedDemo', () => {
  const seed = vi.fn();
  const m = (name: string, enabledByDefault: boolean) =>
    defineFeature({
      name,
      enabledByDefault,
      routes: [],
      nav: [],
      permissions: [],
      events: { emits: [], consumes: [] },
      migrations: [],
      demoSeed: seed,
    });
  it('seeds only enabled features, only in demo mode', async () => {
    const world = buildDemoWorld();
    expect(
      await seedDemo([m('a', true), m('b', false)], { world, env: { DATA_MODE: 'demo' } }),
    ).toEqual(['a']);
    expect(
      await seedDemo([m('b', false)], { world, env: { DATA_MODE: 'demo', FEATURE_ALL: 'on' } }),
    ).toEqual(['b']);
    await expect(seedDemo([m('a', true)], { world, env: { DATA_MODE: 'live' } })).rejects.toThrow(
      /refused/,
    );
  });
});
