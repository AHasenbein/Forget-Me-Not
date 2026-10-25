import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '@core/events/bus';
import {
  FakeClock,
  createCircleMember,
  createLinkedPair,
  createMockNotifier,
  createMockPlaid,
  createPrimaryCaregiver,
} from '@core/testing';
import { HttpError } from '@core/server/errors';
import { MAX_REQUESTS_PER_DAY, OUTCOME_MS, REQUEST_TTL_MS } from '../../constants';
import { createMoneyCheckService } from '../../service';
import { MemoryRequestStore } from '../../store';

const clock = new FakeClock('2026-01-01T12:00:00Z');
const { patient, caregiver } = createLinkedPair();
const second = createPrimaryCaregiver(patient);
const bills = [
  { id: 'b1', payee: 'Fictional Water', amountCents: 3150, paid: false, dueDate: '2026-01-04' },
];

let push: ReturnType<typeof createMockNotifier>;
let alerts: unknown[];
let store: MemoryRequestStore;
let plaid = createMockPlaid(bills);
let svc: ReturnType<typeof createMoneyCheckService>;

const build = (opts: { failPush?: boolean } = {}) => {
  const bus = new EventBus();
  alerts = [];
  bus.on('caregiver.alert', (e) => void alerts.push(e));
  svc = createMoneyCheckService({
    store,
    bus,
    notifier: () =>
      opts.failPush
        ? {
            push: async () => {
              throw new Error('down');
            },
            sms: async () => {},
          }
        : push,
    plaid: () => plaid,
    caregiversOf: () => [caregiver.id],
    now: clock.now,
  });
};
const code = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    return e instanceof HttpError ? `${e.status}:${e.code}` : 'other';
  }
  return 'ok';
};

beforeEach(() => {
  clock.setTime('2026-01-01T12:00:00Z');
  push = createMockNotifier();
  store = new MemoryRequestStore();
  plaid = createMockPlaid(bills);
  build();
});

describe('create', () => {
  it('a gift card question is "stop", pushes the caregiver once with a generic body, and emits an urgent alert', async () => {
    const { request } = await svc.create(patient, { kind: 'gift_card' });
    expect(request).toMatchObject({ status: 'waiting', level: 'stop' });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.body).not.toMatch(/gift|\$|\d/i);
    expect(alerts).toEqual([
      {
        patientId: patient.id,
        source: 'money-check',
        severity: 'urgent',
        reasonCode: 'money_check_stop',
      },
    ]);
  });

  it('repeated taps return the same request: one push, one alert', async () => {
    const a = await svc.create(patient, { kind: 'gift_card' });
    const b = await svc.create(patient, { kind: 'bill' });
    expect(b.alreadyOpen).toBe(true);
    expect(b.request.id).toBe(a.request.id);
    expect(push.sent).toHaveLength(1);
    expect(alerts).toHaveLength(1);
  });

  it('concurrent taps create exactly one request', async () => {
    const [a, b] = await Promise.all([
      svc.create(patient, { kind: 'bill' }),
      svc.create(patient, { kind: 'bill' }),
    ]);
    expect(a.request.id).toBe(b.request.id);
    expect(push.sent).toHaveLength(1);
  });

  it('a normal bill is "ok" but still waits for the caregiver (fail closed)', async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    expect(request).toMatchObject({ level: 'ok', status: 'waiting' });
    expect(alerts[0]).toMatchObject({ severity: 'warning', reasonCode: 'money_check_review' });
  });

  it('a bank outage makes a bill "check", never "ok"', async () => {
    plaid = {
      listTransactions: async () => {
        throw new Error('bank down');
      },
    } as never;
    expect((await svc.create(patient, { kind: 'bill' })).request.level).toBe('check');
  });

  it('never tells the patient "asked your caregiver" when no push was delivered', async () => {
    build({ failPush: true });
    expect((await svc.create(patient, { kind: 'gift_card' })).request.status).toBe(
      'no_one_reachable',
    );
  });

  it('the patient view carries no payee, amount or bill id', async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    expect(JSON.stringify(request)).not.toMatch(/Water|3150|31\.5|b1/);
  });

  it('caps requests per day', async () => {
    for (let i = 0; i < MAX_REQUESTS_PER_DAY; i++) {
      const { request } = await svc.create(patient, { kind: 'gift_card' });
      svc.decide(caregiver, request.id, 'decline');
    }
    expect(await code(svc.create(patient, { kind: 'gift_card' }))).toBe('429:too_many');
    clock.advance(24 * 60 * 60_000 + 1);
    expect(await code(svc.create(patient, { kind: 'gift_card' }))).toBe('ok');
  });

  it('only a linked patient can ask', async () => {
    expect(await code(svc.create(caregiver, { kind: 'bill' }))).toBe('403:forbidden');
    expect(await code(svc.create({ ...patient, patientId: null }, { kind: 'bill' }))).toBe(
      '403:not_linked',
    );
  });
});

describe('decide', () => {
  it('approve: the patient is told OK, the caregiver sees nothing open, the audit records it', async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    expect(svc.decide(caregiver, request.id, 'approve').status).toBe('approved');
    expect((await svc.active(patient)).request).toMatchObject({ status: 'ok_to_go' });
    expect((await svc.active(caregiver)).request).toBeNull();
    expect(svc.auditLog(caregiver).entries.map((e) => e.action)).toEqual(['approved', 'created']);
  });

  it('decline: the patient is told not to pay', async () => {
    const { request } = await svc.create(patient, { kind: 'gift_card' });
    svc.decide(caregiver, request.id, 'decline');
    expect((await svc.active(patient)).request).toMatchObject({ status: 'dont_pay' });
  });

  it('the patient can never decide, and a circle member neither', async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    expect(await code(() => svc.decide(patient, request.id, 'approve'))).toBe('403:forbidden');
    const member = createCircleMember(patient, { locationGrant: true });
    expect(await code(() => svc.decide(member, request.id, 'approve'))).toBe('403:forbidden');
    expect((await svc.active(patient)).request).toMatchObject({ status: 'waiting' });
  });

  it("another patient's request is a 404", async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    const stranger = createPrimaryCaregiver(createLinkedPair().patient);
    expect(await code(() => svc.decide(stranger, request.id, 'approve'))).toBe('404:not_found');
  });

  it('first decision wins; a second caregiver gets 409; the same caregiver tapping twice is fine', async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    svc.decide(caregiver, request.id, 'approve');
    expect(svc.decide(caregiver, request.id, 'approve').status).toBe('approved');
    expect(await code(() => svc.decide(second, request.id, 'decline'))).toBe('409:already_decided');
    expect(await code(() => svc.decide(caregiver, request.id, 'decline'))).toBe(
      '409:already_decided',
    );
  });
});

describe('expiry (fail closed)', () => {
  it('no answer in time means "don\'t pay", never "go ahead"', async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    clock.advance(REQUEST_TTL_MS);
    expect(svc.sweep()).toEqual({ expired: 1 });
    expect((await svc.active(patient)).request).toMatchObject({ status: 'dont_pay' });
    expect(await code(() => svc.decide(caregiver, request.id, 'approve'))).toBe('409:expired');
    expect(svc.auditLog(caregiver).entries[0]).toMatchObject({ action: 'expired', by: null });
  });

  it('a late approve cannot slip in before the sweep runs', async () => {
    const { request } = await svc.create(patient, { kind: 'bill' });
    clock.advance(REQUEST_TTL_MS + 1);
    expect(await code(() => svc.decide(caregiver, request.id, 'approve'))).toBe('409:expired');
    expect((await svc.active(patient)).request).toMatchObject({ status: 'dont_pay' });
  });

  it('a new request is allowed after expiry, and the old answer fades from the patient screen', async () => {
    await svc.create(patient, { kind: 'gift_card' });
    clock.advance(REQUEST_TTL_MS);
    expect((await svc.create(patient, { kind: 'gift_card' })).alreadyOpen).toBe(false);
    svc.sweep();
    clock.advance(REQUEST_TTL_MS);
    svc.sweep();
    clock.advance(OUTCOME_MS);
    expect((await svc.active(patient)).request).toBeNull();
  });
});

describe('caregiver view', () => {
  it('shows the bill it is about, looked up now, and survives a bank outage', async () => {
    await svc.create(patient, { kind: 'bill' });
    expect(await svc.active(caregiver)).toMatchObject({
      bill: { payee: 'Fictional Water', amountCents: 3150 },
    });
    plaid = {
      listTransactions: async () => {
        throw new Error('down');
      },
    } as never;
    const seen = await svc.active(caregiver);
    expect(seen.request).not.toBeNull();
    expect(seen.bill).toBeNull();
  });

  it('audit is caregiver-only and holds no amounts', async () => {
    await svc.create(patient, { kind: 'bill' });
    expect(await code(() => svc.auditLog(patient))).toBe('403:forbidden');
    expect(JSON.stringify(svc.auditLog(caregiver))).not.toMatch(/3150|Water/);
  });
});
