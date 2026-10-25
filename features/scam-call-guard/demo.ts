import type { DemoWorld } from '@core/demo/world';
import { getService, getStore, setCaregivers } from './runtime';
import { detectSignals, levelFor } from './signals';

/**
 * Registers the demo caregiver and seeds ONE already-analysed past call from `world.scamCall`, so the caregiver
 * view has an overview without any recording. The transcript is used only to derive the signals; it is not stored,
 * and the caller number is never kept. Idempotent (fixed id).
 */
export function seedScamCallGuard(world: DemoWorld): void {
  getService(); // make sure the runtime exists
  setCaregivers(world.patient.id, [world.caregiver.id]);
  const store = getStore();
  if (store.get(world.scamCall.id)) return;
  const signals = detectSignals(world.scamCall.transcript);
  const at = new Date(Date.now() - 2 * 60_000).toISOString();
  store.put({
    id: world.scamCall.id,
    patientId: world.patient.id,
    startedAt: at,
    lastSegmentAt: at,
    endedAt: at,
    status: 'ended',
    lastSeq: 0,
    totalChars: world.scamCall.transcript.length,
    charsSinceAnalysis: 0,
    signals,
    level: levelFor(signals),
    aiVerdict: 'scam',
    aiConfidence: world.scamCall.confidence,
    summary: world.scamCall.summary,
    needsReview: false,
    alertedLevel: levelFor(signals),
    notifiedLevel: levelFor(signals),
    pushAttempts: 1,
    lastPushAt: at,
    review: null,
    reviewedBy: null,
    reviewedAt: null,
  });
}
