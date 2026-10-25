import type { AuthUser } from '@core/auth/types';
import type { EventBus } from '@core/events/bus';
import type { Notifier } from '@core/notifications';
import type { PlaidPort } from '@core/providers/types';
import { HttpError } from '@core/server/errors';
import { DAY_MS, MAX_REQUESTS_PER_DAY, OUTCOME_MS, REQUEST_TTL_MS } from './constants';
import { assess } from './rules';
import type { Kind, MoneyRequest, PatientStatus } from './schemas';
import type { RequestStore } from './store';

export interface MoneyCheckDeps {
  store: RequestStore;
  bus: EventBus;
  notifier: () => Notifier; // lazy: resolved only when a push is actually sent
  plaid: () => PlaidPort;
  /** Current primary caregiver(s) of a patient, looked up on every push so an unlinked caregiver stops receiving. */
  caregiversOf: (patientId: string) => string[];
  now: () => Date;
}

// Generic on purpose: no name, payee or amount in a push. The app fetches the details after opening.
const PUSH = { title: 'Please check something', body: 'Open Forget Me Not.' };

export function createMoneyCheckService({
  store,
  bus,
  notifier,
  plaid,
  caregiversOf,
  now,
}: MoneyCheckDeps) {
  const patientOf = (user: AuthUser): string => {
    if (!user.patientId) throw new HttpError(403, 'not_linked');
    return user.patientId;
  };
  const requireRole = (user: AuthUser, ...roles: AuthUser['role'][]) => {
    if (!roles.includes(user.role)) throw new HttpError(403, 'forbidden');
  };
  /** 404 (never 403) for another patient's request: don't confirm that the id exists. */
  const ownRequest = (user: AuthUser, id: string) => {
    const r = store.get(id);
    if (!r || r.patientId !== patientOf(user)) throw new HttpError(404, 'not_found');
    return r;
  };
  const audit = (
    r: MoneyRequest,
    action: 'created' | 'approved' | 'declined' | 'expired',
    by: string | null,
  ) =>
    store.addAudit({
      at: now().toISOString(),
      patientId: r.patientId,
      requestId: r.id,
      action,
      by,
    });

  /** Fail closed: an undecided request past its time becomes "declined", never "approved". */
  const expireIfDue = (r: MoneyRequest): MoneyRequest => {
    if (r.status !== 'pending' || now().getTime() < Date.parse(r.expiresAt)) return r;
    const done: MoneyRequest = {
      ...r,
      status: 'declined',
      decidedBy: null,
      decidedAt: now().toISOString(),
    };
    store.put(done);
    audit(done, 'expired', null);
    return done;
  };

  const patientStatus = (r: MoneyRequest): PatientStatus =>
    r.status === 'approved'
      ? 'ok_to_go'
      : r.status === 'declined'
        ? 'dont_pay'
        : r.delivered
          ? 'waiting'
          : 'no_one_reachable';

  /** The patient sees a status and plain reason codes. Never a payee or an amount. */
  const patientView = (r: MoneyRequest) => ({
    id: r.id,
    status: patientStatus(r),
    level: r.level,
    reasons: r.reasons,
    since: r.createdAt,
  });

  return {
    /** The patient asks "may I pay this?". Idempotent while a request is open (repeated taps, same request, no second push). */
    async create(user: AuthUser, input: { kind: Kind }) {
      requireRole(user, 'patient');
      const patientId = patientOf(user);
      const open = store.getOpen(patientId);
      if (open) {
        const current = expireIfDue(open);
        if (current.status === 'pending')
          return { request: patientView(current), alreadyOpen: true };
      }
      const since = new Date(now().getTime() - DAY_MS).toISOString();
      if (store.countSince(patientId, since) >= MAX_REQUESTS_PER_DAY)
        throw new HttpError(429, 'too_many');

      let bills: Awaited<ReturnType<PlaidPort['listTransactions']>> = [];
      if (input.kind === 'bill') {
        try {
          bills = await plaid().listTransactions(patientId);
        } catch {
          // bank unavailable: no matching bill => "check", never "ok"
        }
      }
      // A concurrent tap may have created the request while we awaited the bank.
      const raced = store.getOpen(patientId);
      if (raced) return { request: patientView(raced), alreadyOpen: true };

      const verdict = assess(input.kind, bills);
      const r: MoneyRequest = {
        id: crypto.randomUUID(),
        patientId,
        kind: input.kind,
        level: verdict.level,
        reasons: verdict.reasons,
        billId: verdict.bill?.id ?? null,
        createdAt: now().toISOString(),
        expiresAt: new Date(now().getTime() + REQUEST_TTL_MS).toISOString(),
        status: 'pending',
        delivered: false,
        decidedBy: null,
        decidedAt: null,
      };
      store.put(r);
      audit(r, 'created', user.id);
      await bus.emit('caregiver.alert', {
        patientId,
        source: 'money-check',
        severity: r.level === 'stop' ? 'urgent' : 'warning',
        reasonCode: r.level === 'stop' ? 'money_check_stop' : 'money_check_review',
      });
      for (const caregiverId of caregiversOf(patientId)) {
        try {
          await notifier().push(caregiverId, { ...PUSH, data: { requestId: r.id } });
          r.delivered = true;
        } catch {
          // unreachable caregiver: the patient is told so, and the request expires to "don't pay"
        }
      }
      store.put(r);
      return { request: patientView(r), alreadyOpen: false };
    },

    /** Patient: status only. Caregiver: the request plus the bill it is about (looked up now, not stored). */
    async active(user: AuthUser) {
      requireRole(user, 'patient', 'primary_caregiver');
      const patientId = patientOf(user);
      const open = store.getOpen(patientId);
      const r = open ? expireIfDue(open) : undefined;
      if (user.role === 'patient') {
        // Show the outcome of the latest decision for a while, so the patient is never left guessing.
        return { request: r && r.status === 'pending' ? patientView(r) : latestOutcome() };
      }
      if (!r || r.status !== 'pending') return { request: null, bill: null };
      let bill = null;
      if (r.billId) {
        try {
          bill = (await plaid().listTransactions(patientId)).find((b) => b.id === r.billId) ?? null;
        } catch {
          // bank unavailable: the request is still shown
        }
      }
      return { request: r, bill };

      function latestOutcome() {
        const done = store.latestDecided(patientId);
        const fresh =
          done && now().getTime() - Date.parse(done.decidedAt ?? done.createdAt) < OUTCOME_MS;
        return fresh ? patientView(done) : null;
      }
    },

    /** Caregiver only. Compare-and-set: the first decision wins, a second caregiver gets 409. */
    decide(user: AuthUser, id: string, decision: 'approve' | 'decline') {
      requireRole(user, 'primary_caregiver');
      const r = expireIfDue(ownRequest(user, id));
      const status = decision === 'approve' ? 'approved' : 'declined';
      if (r.status === status && r.decidedBy === user.id) return r; // repeated tap by the same caregiver
      if (r.status !== 'pending')
        throw new HttpError(409, r.decidedBy === null ? 'expired' : 'already_decided');
      const done: MoneyRequest = {
        ...r,
        status,
        decidedBy: user.id,
        decidedAt: now().toISOString(),
      };
      store.put(done);
      audit(done, status, user.id);
      return done;
    },

    /** Caregiver: who asked and who decided, newest first. No amounts or payees. */
    auditLog(user: AuthUser) {
      requireRole(user, 'primary_caregiver');
      return { entries: store.audit(patientOf(user)) };
    },

    /** The clock. Call about every minute from the manifest job. Idempotent. */
    sweep(): { expired: number } {
      let expired = 0;
      for (const r of store.allPending()) if (expireIfDue(r).status !== 'pending') expired++;
      return { expired };
    },
  };
}

export type MoneyCheckService = ReturnType<typeof createMoneyCheckService>;
