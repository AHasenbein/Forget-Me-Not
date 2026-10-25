import type { AiClient } from '@core/ai/client';
import { LOW_CONFIDENCE } from '@core/ai/client';
import type { AuthUser } from '@core/auth/types';
import type { EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import { HttpError } from '@core/server/errors';
import { AI_TASK, buildContent, parseVerdict } from './analyzer';
import {
  AI_DANGER_CONFIDENCE,
  AI_TIMEOUT_MS,
  ANALYZE_EVERY_CHARS,
  ANALYZE_FIRST_CHARS,
  IDLE_END_MS,
  MAX_CALL_CHARS,
  MAX_CALL_MS,
  MAX_PUSH_ATTEMPTS,
  PUSH_RETRY_MS,
  WINDOW_CHARS,
} from './constants';
import type { Call, Review, Warning } from './schemas';
import { PAYMENT_SIGNALS, detectSignals, isHigher, levelFor, maxLevel } from './signals';
import type { CallStore } from './store';

export interface ScamCallGuardDeps {
  store: CallStore;
  bus: EventBus;
  notifier: () => Notifier;
  ai: () => AiClient;
  /** Consent/jurisdiction gate (`CALL_RECORDING_ENABLED`). Checked on start AND on every segment. */
  recordingEnabled: () => boolean;
  /** Current primary caregiver(s). Called on every attempt so unlinked caregivers stop receiving. */
  caregiversOf: (patientId: string) => string[];
  now: () => Date;
  aiTimeoutMs?: number;
}

/** Fixed copy keyed by the warning enum. AI text NEVER reaches the patient. Not advice: it only says what to avoid. */
export const PATIENT_COPY: Record<Warning, string> = {
  none: '',
  caution: 'Be careful. This call may be a scam. You do not have to decide anything now.',
  danger:
    'This call may be a scam. Do not buy gift cards or read out any numbers. You can hang up. Your caregiver has been told.',
};

// Generic on purpose: no name, number or call content in a push.
const PUSH = { title: 'Please check in', body: 'Open Forget Me Not now.' };

export function createScamCallGuardService(deps: ScamCallGuardDeps) {
  const { store, bus, now } = deps;
  /** Rolling transcript windows. In memory only, per active call, dropped when the call ends. Never stored or logged. */
  const windows = new Map<string, string>();
  const analysing = new Set<string>();

  const patientOf = (user: AuthUser): string => {
    if (!user.patientId) throw new HttpError(403, 'not_linked');
    return user.patientId;
  };
  const requireRole = (user: AuthUser, role: AuthUser['role']) => {
    if (user.role !== role) throw new HttpError(403, 'forbidden');
  };
  const requireRecording = () => {
    if (!deps.recordingEnabled()) throw new HttpError(403, 'recording_disabled');
  };
  /** 404 (never 403) for another patient's call: don't confirm that the id exists. */
  const ownCall = (user: AuthUser, id: string) => {
    const c = store.get(id);
    if (!c || c.patientId !== patientOf(user)) throw new HttpError(404, 'not_found');
    return c;
  };

  const patientView = (c: Call) => ({
    id: c.id,
    status: c.status,
    warning: c.level,
    message: PATIENT_COPY[c.level],
  });
  const listItem = (c: Call) => ({
    id: c.id,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    status: c.status,
    warning: c.level,
    signals: c.signals,
    needsReview: c.needsReview,
    review: c.review,
  });

  /** One AI assessment of the in-memory window. Never throws; the AI can raise the warning but never lower it. */
  async function analyse(c: Call) {
    const text = windows.get(c.id);
    if (!text || analysing.has(c.id)) return;
    analysing.add(c.id);
    c.charsSinceAnalysis = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error('ai_timeout')), deps.aiTimeoutMs ?? AI_TIMEOUT_MS);
      });
      const r = await Promise.race([
        deps.ai().complete({ task: AI_TASK, content: buildContent(text) }),
        timeout,
      ]);
      const v = parseVerdict(r.text);
      c.aiVerdict = v.verdict;
      c.aiConfidence = r.confidence;
      c.summary = v.summary || c.summary;
      if (v.verdict === 'unparsed' || v.verdict === 'unclear' || r.confidence < LOW_CONFIDENCE)
        c.needsReview = true;
      if (v.verdict === 'scam' && r.confidence >= LOW_CONFIDENCE)
        c.level = maxLevel(c.level, r.confidence >= AI_DANGER_CONFIDENCE ? 'danger' : 'caution');
    } catch {
      c.needsReview = true; // AI down or too slow: the rules already ran, a human should look
    } finally {
      clearTimeout(timer);
      analysing.delete(c.id);
    }
  }

  /** Tell the caregiver once per tier (caution, then danger). Failures never fail the request; the sweep retries pushes. */
  async function escalate(c: Call) {
    if (isHigher(c.level, c.alertedLevel)) {
      c.alertedLevel = c.level;
      store.put(c); // record first: a crash must not cause a re-send storm
      try {
        await bus.emit('caregiver.alert', {
          patientId: c.patientId,
          source: 'scam-call-guard',
          severity: c.level === 'danger' ? 'urgent' : 'warning',
          reasonCode: c.signals.some((s) => PAYMENT_SIGNALS.includes(s))
            ? 'suspected_scam_payment'
            : 'suspected_scam_call',
        });
      } catch {
        // the bus already isolates handlers; stay silent
      }
    }
    if (isHigher(c.alertedLevel, c.notifiedLevel) && c.pushAttempts < MAX_PUSH_ATTEMPTS) {
      await push(c);
    }
    store.put(c);
  }

  async function push(c: Call) {
    c.pushAttempts += 1;
    c.lastPushAt = now().toISOString();
    store.put(c);
    let delivered = false;
    for (const id of deps.caregiversOf(c.patientId)) {
      try {
        await deps.notifier().push(id, { ...PUSH, data: { callId: c.id } });
        delivered = true;
      } catch {
        // unreachable caregiver: the sweep retries
      }
    }
    if (delivered) c.notifiedLevel = c.alertedLevel;
  }

  async function finalise(c: Call) {
    if (c.status === 'ended') return;
    if (windows.has(c.id)) await analyse(c); // final overview from the whole window
    c.status = 'ended';
    c.endedAt = now().toISOString();
    windows.delete(c.id);
    store.put(c);
    await escalate(c);
  }

  return {
    /** Explicit per-call start. Idempotent while a call is active, so a double tap makes one session. */
    async start(user: AuthUser) {
      requireRole(user, 'patient');
      const patientId = patientOf(user);
      requireRecording();
      const open = store.getOpen(patientId);
      if (open && now().getTime() - Date.parse(open.startedAt) < MAX_CALL_MS)
        return { call: patientView(open), alreadyActive: true };
      if (open) await finalise(open);
      const t = now().toISOString();
      // No await between the lookup above and this put: two quick taps cannot both create a call.
      const c: Call = {
        id: crypto.randomUUID(),
        patientId,
        startedAt: t,
        lastSegmentAt: t,
        endedAt: null,
        status: 'active',
        lastSeq: -1,
        totalChars: 0,
        charsSinceAnalysis: 0,
        signals: [],
        level: 'none',
        aiVerdict: null,
        aiConfidence: null,
        summary: null,
        needsReview: false,
        alertedLevel: 'none',
        notifiedLevel: 'none',
        pushAttempts: 0,
        lastPushAt: null,
        review: null,
        reviewedBy: null,
        reviewedAt: null,
      };
      store.put(c);
      return { call: patientView(c), alreadyActive: false };
    },

    /** Real-time path: rules run on every segment; the AI runs early (ANALYZE_FIRST_CHARS), then every ANALYZE_EVERY_CHARS. The response carries the warning. */
    async addSegment(user: AuthUser, id: string, seg: { seq: number; text: string }) {
      requireRole(user, 'patient');
      const c = ownCall(user, id);
      requireRecording();
      if (c.status !== 'active') throw new HttpError(409, 'ended');
      if (seg.seq <= c.lastSeq) return { call: patientView(c), duplicate: true };
      if (c.totalChars + seg.text.length > MAX_CALL_CHARS) throw new HttpError(413, 'too_long');
      // Sync section: claim the seq before any await so a concurrent retry is seen as a duplicate.
      c.lastSeq = seg.seq;
      c.lastSegmentAt = now().toISOString();
      c.totalChars += seg.text.length;
      c.charsSinceAnalysis += seg.text.length;
      const window = ((windows.get(c.id) ?? '') + ' ' + seg.text).slice(-WINDOW_CHARS);
      windows.set(c.id, window);

      const signals = new Set([...c.signals, ...detectSignals(window)]);
      c.signals = [...signals];
      c.level = maxLevel(c.level, levelFor(c.signals));
      store.put(c);

      if (
        c.charsSinceAnalysis >= (c.aiVerdict === null ? ANALYZE_FIRST_CHARS : ANALYZE_EVERY_CHARS)
      )
        await analyse(c);
      await escalate(c);
      return { call: patientView(c), duplicate: false };
    },

    /** The patient hangs up (or the app does). Idempotent. */
    async end(user: AuthUser, id: string) {
      requireRole(user, 'patient');
      const c = ownCall(user, id);
      await finalise(c);
      return { call: patientView(c) };
    },

    list(user: AuthUser, limit = 20) {
      requireRole(user, 'primary_caregiver');
      return { calls: store.listByPatient(patientOf(user), limit).map(listItem) };
    },

    /** The overview is "recording access": every caregiver read is audit-logged. */
    detail(user: AuthUser, id: string) {
      requireRole(user, 'primary_caregiver');
      const c = ownCall(user, id);
      store.appendView({
        callId: c.id,
        patientId: c.patientId,
        viewerId: user.id,
        at: now().toISOString(),
      });
      const ruleLevel = levelFor(c.signals);
      return {
        call: {
          ...listItem(c),
          summary: c.summary,
          summarySource: 'ai' as const, // AI-generated, may be wrong: the UI must say so
          aiVerdict: c.aiVerdict,
          aiConfidence: c.aiConfidence,
          aiDisagrees: c.aiVerdict === 'not_scam' && ruleLevel !== 'none',
        },
      };
    },

    review(user: AuthUser, id: string, outcome: Review) {
      requireRole(user, 'primary_caregiver');
      const c = ownCall(user, id);
      c.review = outcome;
      c.reviewedBy = user.id;
      c.reviewedAt = now().toISOString();
      c.needsReview = false;
      store.put(c);
      return { call: listItem(c) };
    },

    views(user: AuthUser, limit = 50) {
      requireRole(user, 'primary_caregiver');
      return { views: store.listViews(patientOf(user), limit) };
    },

    /** The clock. Run about every minute from a job: closes abandoned calls and retries failed caregiver pushes. */
    async sweep(): Promise<{ ended: number; retried: number }> {
      const t = now().getTime();
      const stats = { ended: 0, retried: 0 };
      for (const c of store.all()) {
        if (c.status === 'active' && t - Date.parse(c.lastSegmentAt) >= IDLE_END_MS) {
          await finalise(c);
          stats.ended++;
        } else if (
          isHigher(c.alertedLevel, c.notifiedLevel) &&
          c.pushAttempts < MAX_PUSH_ATTEMPTS &&
          t - Date.parse(c.lastPushAt ?? c.startedAt) >= PUSH_RETRY_MS
        ) {
          await push(c);
          store.put(c);
          stats.retried++;
        }
      }
      return stats;
    },
  };
}

export type ScamCallGuardService = ReturnType<typeof createScamCallGuardService>;
