import { afterEach, describe, expect, it } from 'vitest';
import type { LocationReadContract } from '@contracts/location';
import { getProviders, provideOwned, registerLive } from '.';
import { resetOwned } from './owned';

const fake = (): LocationReadContract => ({
  getLastKnown: async () => null,
  registerGeofence: async () => undefined,
  removeGeofence: async () => undefined,
  onGeofenceEvent: () => () => undefined,
});
const allLive = {
  DATA_MODE: 'live',
  DATA_MODE_AI: 'demo',
  DATA_MODE_VISION: 'demo',
  DATA_MODE_DOCUMENTS: 'demo',
  DATA_MODE_PLAID: 'demo',
  DATA_MODE_NOTIFIER: 'demo',
};

afterEach(() => resetOwned());

describe('feature-owned ports', () => {
  it('demo: the owner beats the canned adapter', () => {
    const owner = fake();
    expect(getProviders().location).not.toBe(owner);
    provideOwned('location', owner);
    expect(getProviders().location).toBe(owner);
  });

  it('live: the owner serves it even with DATA_MODE_LOCATION=demo, so no canned position reaches a caregiver', () => {
    registerLive('verifier', { verify: async () => null });
    const owner = fake();
    provideOwned('location', owner);
    expect(getProviders({ env: { ...allLive, DATA_MODE_LOCATION: 'demo' } }).location).toBe(owner);
    expect(getProviders({ env: { ...allLive, DATA_MODE_LOCATION: 'live' } }).location).toBe(owner);
  });

  it('live without an owner or a live adapter still throws (never a silent canned fallback)', () => {
    registerLive('verifier', { verify: async () => null });
    expect(() => getProviders({ env: { ...allLive, DATA_MODE_LOCATION: 'live' } })).toThrow(
      /location/,
    );
  });

  it('only allow-listed ports can be owned: a feature can never replace auth', () => {
    const impostor = { verify: async () => null };
    // @ts-expect-error verifier is not an ownable port
    provideOwned('verifier', impostor);
    expect(getProviders().verifier).not.toBe(impostor);
  });
});
