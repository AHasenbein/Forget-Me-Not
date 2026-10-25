import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { billReadingSchema } from '@core/ai/documents';
import { createApp } from '@core/server/app';
import { buildDemoWorld, demoVerifier, seedDemo } from '@core/demo';
import manifest from '../../manifest';
import { SAMPLE_READINGS } from '../../demo/fixtures';
import { SAMPLE_BILLS } from '../../demo/samples';
import { resetRuntime } from '../../runtime';

const env = { FEATURE_BILL_READER: 'on', DATA_MODE: 'demo' };
const app = () =>
  createApp({ manifests: [manifest], verifier: demoVerifier(buildDemoWorld()), env });

describe('demo samples', () => {
  beforeEach(() => resetRuntime());

  it('every sample picture is a real JPEG with a valid canned reading', () => {
    expect(SAMPLE_BILLS.length).toBeGreaterThanOrEqual(3);
    for (const s of SAMPLE_BILLS) {
      expect(
        Buffer.from(s.data, 'base64')
          .subarray(0, 3)
          .equals(Buffer.from([0xff, 0xd8, 0xff])),
      ).toBe(true);
      expect(billReadingSchema.safeParse(SAMPLE_READINGS[s.id]).success).toBe(true);
    }
  });
  it('after seeding, each sample is answered end to end as a demo patient (no model, no key)', async () => {
    await seedDemo([manifest], { world: buildDemoWorld(), env });
    for (const s of SAMPLE_BILLS) {
      const res = await app().request('/api/bill-reader/scans', {
        method: 'POST',
        headers: { authorization: 'Bearer demo:patient', 'content-type': 'application/json' },
        body: JSON.stringify({ frames: [{ mediaType: s.mediaType, data: s.data }] }),
      });
      expect(res.status).toBe(200);
      const { scan } = await res.json();
      const want = SAMPLE_READINGS[s.id]!;
      expect(scan.amountCents).toBe(want.amountCents);
      expect(scan.outcome).toBe(want.redFlags.length ? 'flagged' : 'read');
    }
    const list = await (
      await app().request('/api/bill-reader/scans', {
        headers: { authorization: 'Bearer demo:caregiver' },
      })
    ).json();
    expect(list.scans.every((x: { source: string }) => x.source === 'sample')).toBe(true);
  });
  it('a picture that is not a sample is "unclear" in the demo (honest: the demo cannot read it)', async () => {
    await seedDemo([manifest], { world: buildDemoWorld(), env });
    const other = SAMPLE_BILLS[0]!.data.slice(0, -8) + 'AAAAAAAA';
    expect(createHash('sha256').update(other).digest('hex')).not.toBe(
      createHash('sha256').update(SAMPLE_BILLS[0]!.data).digest('hex'),
    );
    const res = await app().request('/api/bill-reader/scans', {
      method: 'POST',
      headers: { authorization: 'Bearer demo:patient', 'content-type': 'application/json' },
      body: JSON.stringify({ frames: [{ mediaType: 'image/jpeg', data: other }] }),
    });
    expect((await res.json()).scan.outcome).toBe('unclear');
  });
});
