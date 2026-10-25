import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UNREADABLE, type BillReading } from '@core/ai/documents';
import { EventBus } from '@core/events/bus';
import { HttpError } from '@core/server/errors';
import { FakeClock, createCircleMember, createLinkedPair } from '@core/testing';
import { MAX_SCANS_PER_DAY } from '../../constants';
import { createBillReaderService } from '../../service';
import { MemoryScanStore } from '../../store';

const clock = new FakeClock('2026-10-24T12:00:00Z');
const { patient, caregiver } = createLinkedPair();
const daughter = createCircleMember(patient, { locationGrant: true });
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD'; // a real JPEG header, base64
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const jpeg = [{ mediaType: 'image/jpeg' as const, data: JPEG }];

const water: BillReading = {
  isBill: true,
  utility: 'water',
  payee: 'Fictional Water Co',
  amountCents: 3150,
  dueDate: '2026-11-20',
  redFlags: [],
  confidence: 0.95,
};

let store: MemoryScanStore;
let alerts: unknown[];
let readBill: ReturnType<typeof vi.fn>;
let samples: Record<string, BillReading>;
let svc: ReturnType<typeof createBillReaderService>;

const build = (impl: (f: unknown) => Promise<BillReading> = async () => water) => {
  const bus = new EventBus();
  alerts = [];
  bus.on('caregiver.alert', (e) => void alerts.push(e));
  readBill = vi.fn(impl);
  svc = createBillReaderService({
    store,
    bus,
    documents: () => ({ readBill: readBill as never }),
    sampleReading: (sha) => samples[sha] ?? null,
    now: clock.now,
  });
};
const code = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (e) {
    return e instanceof HttpError ? `${e.status}:${e.code}` : 'other';
  }
  return 'ok';
};

beforeEach(() => {
  clock.setTime('2026-10-24T12:00:00Z');
  store = new MemoryScanStore();
  samples = {};
  build();
});

describe('scan', () => {
  it('a clear bill: the patient gets the facts and the days left (server clock), the caregiver sees it as AI-read', async () => {
    const { scan } = await svc.scan(patient, jpeg);
    expect(scan).toMatchObject({
      outcome: 'read',
      utility: 'water',
      payee: 'Fictional Water Co',
      amountCents: 3150,
      dueDate: '2026-11-20',
      dueInDays: 27,
    });
    const { scans } = svc.list(caregiver);
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ source: 'ai', outcome: 'read', dueInDays: 27 });
    expect(alerts).toHaveLength(0);
  });
  it('days move with the clock; an overdue bill is negative, not hidden', async () => {
    await svc.scan(patient, jpeg);
    clock.advance(30 * 24 * 60 * 60_000);
    expect(svc.list(caregiver).scans[0]!.dueInDays).toBe(-3);
  });
  it('warning signs: flagged, an alert with only enums goes to the caregiver, the patient never sees the flag codes', async () => {
    build(async () => ({ ...water, amountCents: 49900, redFlags: ['gift_cards', 'threat'] }));
    const { scan } = await svc.scan(patient, jpeg);
    expect(scan.outcome).toBe('flagged');
    expect(JSON.stringify(scan)).not.toMatch(/gift_cards|threat|redFlags|confidence|source/);
    expect(alerts).toEqual([
      {
        patientId: patient.id,
        source: 'bill-reader',
        severity: 'warning',
        reasonCode: 'bill_red_flag',
      },
    ]);
    expect(JSON.stringify(alerts)).not.toMatch(/499|water|Fictional/i);
    expect(svc.list(caregiver).scans[0]!.redFlags).toEqual(['gift_cards', 'threat']);
  });
  it('a model that fails, times out-ish, or is unreadable gives "unclear", never a guess', async () => {
    for (const impl of [
      async () => {
        throw new Error('down');
      },
      async () => UNREADABLE,
      async () => ({ ...water, isBill: false }),
      async () => ({ ...water, confidence: 0.3 }),
    ]) {
      build(impl);
      const { scan } = await svc.scan(patient, jpeg);
      expect(scan).toMatchObject({
        outcome: 'unclear',
        payee: '',
        amountCents: null,
        dueDate: null,
      });
    }
  });
  it('a demo sample picture is answered from the canned list, marked "sample", and never reaches the model', async () => {
    const { createHash } = await import('node:crypto');
    samples[createHash('sha256').update(JPEG).digest('hex')] = { ...water, payee: 'Sample Co' };
    const { scan } = await svc.scan(patient, jpeg);
    expect(scan.payee).toBe('Sample Co');
    expect(readBill).not.toHaveBeenCalled();
    expect(svc.list(caregiver).scans[0]!.source).toBe('sample');
  });
  it('the picture itself is never stored or returned', async () => {
    await svc.scan(patient, jpeg);
    expect(JSON.stringify(store.list(patient.patientId!, 10))).not.toContain(JPEG);
    expect(JSON.stringify(svc.list(caregiver))).not.toContain(JPEG);
  });
  it('the model-written company name is cleaned before it is shown', async () => {
    build(async () => ({ ...water, payee: 'Pay at https://evil.example Sunrise Electric' }));
    expect((await svc.scan(patient, jpeg)).scan.payee).toBe('Pay at Sunrise Electric');
  });
  it('a picture whose bytes do not match its declared type is rejected (400), before the model', async () => {
    expect(await code(() => svc.scan(patient, [{ mediaType: 'image/png', data: JPEG }]))).toBe(
      '400:bad_image',
    );
    expect(await code(() => svc.scan(patient, [{ mediaType: 'image/jpeg', data: PNG }]))).toBe(
      '400:bad_image',
    );
    expect(readBill).not.toHaveBeenCalled();
  });
  it('is capped per day (429), and the cap resets after 24h', async () => {
    for (let i = 0; i < MAX_SCANS_PER_DAY; i++) await svc.scan(patient, jpeg);
    expect(await code(() => svc.scan(patient, jpeg))).toBe('429:too_many');
    clock.advance(25 * 60 * 60_000);
    expect(await code(() => svc.scan(patient, jpeg))).toBe('ok');
  });
  it('keeps only the latest 10, newest first', async () => {
    for (let i = 0; i < 12; i++) {
      clock.advance(1000);
      await svc.scan(patient, jpeg);
    }
    const { scans } = svc.list(caregiver);
    expect(scans).toHaveLength(10);
    expect(scans[0]!.createdAt > scans[9]!.createdAt).toBe(true);
  });
});

describe('authorization', () => {
  it('only the patient scans; only the primary caregiver lists; a circle member gets nothing', async () => {
    expect(await code(() => svc.scan(caregiver, jpeg))).toBe('403:forbidden');
    expect(await code(() => svc.scan(daughter, jpeg))).toBe('403:forbidden');
    expect(await code(() => svc.list(patient))).toBe('403:forbidden');
    expect(await code(() => svc.list(daughter))).toBe('403:forbidden');
    expect(await code(() => svc.scan({ ...patient, patientId: null }, jpeg))).toBe(
      '403:not_linked',
    );
    expect(await code(() => svc.list({ ...caregiver, patientId: null }))).toBe('403:not_linked');
  });
  it('a caregiver only sees their own patient’s scans', async () => {
    await svc.scan(patient, jpeg);
    const other = createLinkedPair();
    expect(svc.list(other.caregiver).scans).toEqual([]);
  });
});
