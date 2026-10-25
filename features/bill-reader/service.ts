import { createHash } from 'node:crypto';
import type { BillReading, DocumentReader } from '@core/ai/documents';
import { sniffFrameType, type VisionFrame } from '@core/ai/vision';
import type { AuthUser } from '@core/auth/types';
import type { EventBus } from '@core/events/bus';
import { logger } from '@core/logging/logger';
import { HttpError } from '@core/server/errors';
import { DAY_MS, MAX_SCANS_PER_DAY, READ_TIMEOUT_MS } from './constants';
import { describe, dueInDays } from './rules';
import type { Scan, Source } from './schemas';
import type { ScanStore } from './store';

export interface BillReaderDeps {
  store: ScanStore;
  bus: EventBus;
  /** Lazy: only a scan needs the model. */
  documents: () => DocumentReader;
  /** Demo samples: a picture whose sha256 is registered here is answered from the canned list, not the model. */
  sampleReading: (sha256: string) => BillReading | null;
  now: () => Date;
}

const fingerprint = (data: string) => createHash('sha256').update(data).digest('hex');

export function createBillReaderService({
  store,
  bus,
  documents,
  sampleReading,
  now,
}: BillReaderDeps) {
  const patientOf = (user: AuthUser): string => {
    if (!user.patientId) throw new HttpError(403, 'not_linked');
    return user.patientId;
  };
  const requireRole = (user: AuthUser, ...roles: AuthUser['role'][]) => {
    if (!roles.includes(user.role)) throw new HttpError(403, 'forbidden');
  };
  const todayIso = () => now().toISOString().slice(0, 10);

  /** Days are computed on the server clock, so the screen never depends on the device's date. */
  const withDays = (s: Scan) => ({ ...s, dueInDays: dueInDays(s.dueDate, todayIso()) });

  /** What the patient may see: the facts and a plain outcome. No scam-flag codes, no confidence, no source. */
  const patientView = (s: Scan) => {
    const v = withDays(s);
    return {
      id: v.id,
      createdAt: v.createdAt,
      outcome: v.outcome,
      utility: v.utility,
      payee: v.payee,
      amountCents: v.amountCents,
      dueDate: v.dueDate,
      dueInDays: v.dueInDays,
    };
  };

  async function read(
    frames: VisionFrame[],
  ): Promise<{ reading: BillReading | null; source: Source }> {
    const sample = sampleReading(fingerprint(frames[0]!.data));
    if (sample) return { reading: sample, source: 'sample' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reading = await Promise.race([
        documents().readBill(frames),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), READ_TIMEOUT_MS);
        }),
      ]);
      return { reading, source: 'ai' };
    } catch (err) {
      logger.error('bill read failed', { err: String(err) }); // never the picture or its contents
      return { reading: null, source: 'ai' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** Patient shows a bill. The picture is read once and thrown away; only the facts are kept. */
    async scan(user: AuthUser, frames: VisionFrame[]) {
      requireRole(user, 'patient');
      const patientId = patientOf(user);
      // The declared type can lie: check the real bytes.
      for (const f of frames)
        if (sniffFrameType(f.data) !== f.mediaType) throw new HttpError(400, 'bad_image');
      const since = new Date(now().getTime() - DAY_MS).toISOString();
      if (store.countSince(patientId, since) >= MAX_SCANS_PER_DAY)
        throw new HttpError(429, 'too_many');

      const { reading, source } = await read(frames);
      const d = reading
        ? describe(reading)
        : {
            outcome: 'unclear' as const,
            utility: 'other' as const,
            payee: '',
            amountCents: null,
            dueDate: null,
            redFlags: [],
            confidence: 0,
          };
      const scan: Scan = {
        id: crypto.randomUUID(),
        patientId,
        createdAt: now().toISOString(),
        ...d,
        source,
      };
      store.add(scan);
      if (scan.outcome === 'flagged')
        await bus.emit('caregiver.alert', {
          patientId,
          source: 'bill-reader',
          severity: 'warning',
          reasonCode: 'bill_red_flag', // enum only: no amount, payee or text
        });
      return { scan: patientView(scan) };
    },

    /** Primary caregiver: what was scanned lately, with the warning signs and where the reading came from. */
    list(user: AuthUser) {
      requireRole(user, 'primary_caregiver');
      return { scans: store.list(patientOf(user), 10).map(withDays) };
    },
  };
}

export type BillReaderService = ReturnType<typeof createBillReaderService>;
