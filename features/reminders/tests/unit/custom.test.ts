import { describe, expect, it } from 'vitest';
import type { EventMap } from '@contracts/events';
import { EventBus } from '@core/events/bus';
import { FakeClock, createLinkedPair, createMockNotifier, createMockVision } from '@core/testing';
import { createReminderService } from '../../service';
import { MemoryStore } from '../../store';
import { createScheduleInput } from '../../schemas';
import { labelOf, taskOf } from '../../ui/model';

const NY = 'America/New_York';
const base = { localTime: '08:00', timeZone: NY };

describe('custom reminder input', () => {
  it('accepts plain words and tidies the spacing', () => {
    const r = createScheduleInput.parse({
      ...base,
      kind: 'custom',
      label: '  Water   the plants ',
    });
    expect(r.label).toBe('Water the plants');
  });

  it('needs words for a custom reminder, and refuses words on the built-in kinds', () => {
    expect(createScheduleInput.safeParse({ ...base, kind: 'custom' }).success).toBe(false);
    expect(createScheduleInput.safeParse({ ...base, kind: 'custom', label: ' ' }).success).toBe(
      false,
    );
    expect(createScheduleInput.safeParse({ ...base, kind: 'pill', label: 'Aspirin' }).success).toBe(
      false,
    );
  });

  it('caps the length and refuses links and markup', () => {
    const bad = ['x'.repeat(41), 'see https://evil.example', 'www.example.com', '<b>hi</b>', 'a@b'];
    for (const label of bad)
      expect(createScheduleInput.safeParse({ ...base, kind: 'custom', label }).success).toBe(false);
  });

  it('masks long digit runs (account or phone numbers do not belong in a reminder)', () => {
    const r = createScheduleInput.parse({ ...base, kind: 'custom', label: 'Call bank 12345678' });
    expect(r.label).toBe('Call bank [number]');
  });
});

describe('custom reminder in the service', () => {
  // 2026-06-01 is a Monday; 08:00 EDT = 12:00Z.
  function setup() {
    const clock = new FakeClock('2026-06-01T11:55:00Z');
    const bus = new EventBus();
    const notifier = createMockNotifier();
    const alerts: EventMap['caregiver.alert'][] = [];
    bus.on('caregiver.alert', (e) => void alerts.push(e));
    const svc = createReminderService({
      store: new MemoryStore(),
      bus,
      notifier: () => notifier,
      vision: () => createMockVision(),
      now: clock.now,
    });
    return { svc, clock, notifier, alerts, ...createLinkedPair() };
  }

  it('shows the words on screen, but never in the push or the caregiver alert', async () => {
    const { svc, clock, notifier, alerts, patient, caregiver } = setup();
    const input = createScheduleInput.parse({ ...base, kind: 'custom', label: 'Water the plants' });
    await svc.createSchedule(caregiver, input);

    const [o] = await svc.today(patient);
    expect(o).toMatchObject({ kind: 'custom', label: 'Water the plants' });

    clock.advance(5 * 60_000); // due
    await svc.sweep();
    expect(notifier.sent[0]).toMatchObject({ body: 'Time for your reminder' });

    clock.advance(60 * 60_000); // missed => caregiver alert
    await svc.sweep();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.severity).toBe('warning');
    expect(JSON.stringify([notifier.sent, alerts])).not.toContain('plants');
  });
});

describe('custom reminder wording', () => {
  it('uses the words as the name and the patient headline', () => {
    const r = { kind: 'custom' as const, label: 'Water the plants' };
    expect(labelOf(r)).toBe('Water the plants');
    expect(taskOf(r)).toBe('Water the plants');
    expect(labelOf({ kind: 'pill' })).toBe('Pill');
    expect(taskOf({ kind: 'pill' })).toBe('Time to take your pill');
  });
});
