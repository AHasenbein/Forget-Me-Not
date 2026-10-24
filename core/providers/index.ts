import { dataMode, type Service } from '../config/data-mode';
import { buildDemoWorld, demoProviders, type DemoWorld } from '../demo';
import type { Providers } from './types';

export type { BankTransaction, PlaidPort, Providers } from './types';

/**
 * Live adapters register here in Stage 2 (one line each, in the feature or core module that owns them):
 *   registerLive('notifier', expoPushNotifier)
 * Asking for a live adapter that isn't registered THROWS: we never silently fall back to canned data
 * in live mode (a caregiver must not see fake data believing it is real).
 */
const liveRegistry: Partial<Providers> = {};
export const registerLive = <K extends keyof Providers>(key: K, impl: Providers[K]) => {
  liveRegistry[key] = impl;
};

const SERVICE_OF: Record<keyof Providers, Service> = {
  ai: 'ai',
  vision: 'vision',
  plaid: 'plaid',
  notifier: 'notifier',
  location: 'location',
  verifier: 'data',
};

export function getProviders(
  opts: { env?: Record<string, string | undefined>; world?: DemoWorld } = {},
): Providers {
  const world = opts.world ?? buildDemoWorld();
  const demo = demoProviders(world);
  const out = {} as Providers;
  for (const key of Object.keys(SERVICE_OF) as (keyof Providers)[]) {
    const mode = dataMode(SERVICE_OF[key], opts.env);
    if (mode === 'demo') (out as unknown as Record<string, unknown>)[key] = demo[key];
    else {
      const live = liveRegistry[key];
      if (!live)
        throw new Error(
          `No live "${key}" provider registered. Use DATA_MODE_${SERVICE_OF[key].toUpperCase()}=demo or implement it.`,
        );
      (out as unknown as Record<string, unknown>)[key] = live;
    }
  }
  return out;
}
