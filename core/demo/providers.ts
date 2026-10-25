import { UNREADABLE } from '../ai/documents';
import { createDemoVision } from './vision';
import { createDemoAi } from './ai';
import { createMockLocation } from '../testing/mocks/location';
import { createMockNotifier } from '../testing/mocks/notifier';
import type { Providers } from '../providers/types';
import type { DemoWorld } from './world';

/**
 * Demo token verifier: `demo:patient | demo:caregiver | demo:daughter | demo:friend`. Lets the demo
 * switch roles instantly. Exists ONLY in demo mode; getProviders never hands it out in live mode.
 */
export function demoVerifier(world: DemoWorld): Providers['verifier'] {
  const byToken: Record<string, DemoWorld['patient']> = {
    'demo:patient': world.patient,
    'demo:caregiver': world.caregiver,
    'demo:daughter': world.daughter,
    'demo:friend': world.friend,
  };
  return { verify: async (t) => byToken[t] ?? null };
}

/** Canned adapters. Nothing here touches the network, real keys, or real people. */
export function demoProviders(world: DemoWorld): Providers {
  const granted = new Set([world.patient.id, world.caregiver.id, world.daughter.id]);
  return {
    ai: createDemoAi(world),
    vision: createDemoVision(),
    // Demo reads nothing by itself: the bill-reader feature registers its sample bills; any other picture is "unreadable".
    documents: { readBill: async () => UNREADABLE },
    plaid: { listTransactions: async () => world.bills },
    notifier: createMockNotifier(),
    location: createMockLocation({
      reading: world.location.lastKnown,
      allow: (id) => granted.has(id),
    }).contract,
    verifier: demoVerifier(world),
  };
}
