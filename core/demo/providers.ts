import { createDemoVision } from './vision';
import { createMockAi } from '../testing/mocks/ai';
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
    ai: createMockAi({ text: world.scamCall.summary, confidence: world.scamCall.confidence }),
    vision: createDemoVision(),
    plaid: { listTransactions: async () => world.bills },
    notifier: createMockNotifier(),
    location: createMockLocation({
      reading: world.location.lastKnown,
      allow: (id) => granted.has(id),
    }).contract,
    verifier: demoVerifier(world),
  };
}
