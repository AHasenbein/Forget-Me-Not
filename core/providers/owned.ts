import type { Providers } from './types';

/**
 * Ports whose data a FEATURE owns: location-tracking is the single owner of location, so its contract (real device
 * readings, its own demo seed, its own access checks and audit log) is what other features must read, in demo AND live.
 * Registered from the owner's manifest `register()` (only when its flag is on); getProviders prefers it over the canned
 * demo adapter and the live registry. Deliberately a short allow-list: never auth (`verifier`) or anything with money.
 * Dependency-free (type imports only) so a manifest can import it without pulling server code into the app.
 */
export const OWNED_PORTS = ['location'] as const;
export type OwnedPort = (typeof OWNED_PORTS)[number];

const owned: Partial<Pick<Providers, OwnedPort>> = {};

export const provideOwned = <K extends OwnedPort>(key: K, impl: Providers[K]) => {
  owned[key] = impl;
};

export const ownedPort = <K extends OwnedPort>(key: K): Providers[K] | undefined => owned[key];

/** Tests only. */
export const resetOwned = () => {
  for (const k of Object.keys(owned)) delete (owned as Record<string, unknown>)[k];
};
