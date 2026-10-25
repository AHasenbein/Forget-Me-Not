import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, createLinkedPair } from '@core/testing';
import { createGoodNewsService } from '../../service';
import { createCannedSource, type NewsSource } from '../../sources';
import { MemoryMessageStore } from '../../store';
import type { Story } from '../../schemas';

const clock = new FakeClock('2026-10-25T09:00:00Z');
const { patient, caregiver } = createLinkedPair();
const story = (headline: string): Story => ({
  id: headline,
  headline,
  summary: '',
  source: 'S',
  publishedAt: null,
  url: null,
});

function setup(source: NewsSource, fallback: NewsSource | null = null) {
  const store = new MemoryMessageStore();
  return { store, svc: createGoodNewsService({ store, source, fallback, now: clock.now }) };
}
const counting = (stories: () => Story[]) => {
  let calls = 0;
  const src: NewsSource = {
    kind: 'feeds',
    stories: async () => {
      calls++;
      return stories();
    },
  };
  return { src, calls: () => calls };
};

beforeEach(() => clock.setTime('2026-10-25T09:00:00Z'));

describe('good-news service', () => {
  it('happy path: the caregiver message comes first for the patient, then the stories', async () => {
    const t = setup(createCannedSource(() => [story('Ducks')]));
    t.svc.setMessage(caregiver, 'Good morning!');
    const p = await t.svc.paper(patient);
    expect(p.message).toMatchObject({ text: 'Good morning!' });
    expect(p.stories.map((s) => s.headline)).toEqual(['Ducks']);
  });

  it('freezes one edition per day: a refresh mid-read never changes the pages', async () => {
    let n = 0;
    const c = counting(() => [story(`Story ${++n}`)]);
    const t = setup(c.src);
    const first = await t.svc.paper(patient);
    clock.advance(3 * 3_600_000);
    await t.svc.refresh();
    expect((await t.svc.paper(patient)).editionId).toBe(first.editionId);
    expect(c.calls()).toBe(1);
    clock.setTime('2026-10-26T09:00:00Z'); // next day: a new edition
    expect((await t.svc.paper(patient)).stories[0]!.headline).toBe('Story 2');
  });

  it('concurrent first reads fetch the feeds once', async () => {
    const c = counting(() => [story('A')]);
    const t = setup(c.src);
    await Promise.all([t.svc.paper(patient), t.svc.paper(patient), t.svc.refresh()]);
    expect(c.calls()).toBe(1);
  });

  it('feeds down: demo falls back to canned stories; live shows no stories, never canned ones', async () => {
    const down: NewsSource = {
      kind: 'feeds',
      stories: async () => Promise.reject(new Error('offline')),
    };
    const demo = setup(
      down,
      createCannedSource(() => [story('Canned')]),
    );
    expect((await demo.svc.paper(patient)).stories[0]!.headline).toBe('Canned');
    const live = setup(down, null);
    expect((await live.svc.paper(patient)).stories).toEqual([]);
  });

  it('after a failure it retries later, not on every request', async () => {
    let up = false;
    const c = counting(() => {
      if (!up) throw new Error('offline');
      return [story('Back')];
    });
    const t = setup(c.src);
    await t.svc.paper(patient);
    await t.svc.paper(patient);
    expect(c.calls()).toBe(1);
    up = true;
    clock.advance(11 * 60_000);
    expect((await t.svc.paper(patient)).stories[0]!.headline).toBe('Back');
  });

  it('live keeps the last good paper when the next day the feeds are down', async () => {
    let up = true;
    const c = counting(() => {
      if (!up) throw new Error('offline');
      return [story('Yesterday')];
    });
    const t = setup(c.src, null);
    await t.svc.paper(patient);
    up = false;
    clock.setTime('2026-10-26T09:00:00Z');
    expect((await t.svc.paper(patient)).stories[0]!.headline).toBe('Yesterday');
  });

  it('a message shows for 24 hours, can be replaced and removed', async () => {
    const t = setup(createCannedSource(() => []));
    t.svc.setMessage(caregiver, 'First');
    t.svc.setMessage(caregiver, 'Second');
    expect((await t.svc.paper(patient)).message!.text).toBe('Second');
    clock.advance(25 * 3_600_000);
    expect((await t.svc.paper(patient)).message).toBeNull();
    expect(t.svc.getMessage(caregiver)).toMatchObject({ shownToPatient: false });
    t.svc.clearMessage(caregiver);
    expect(t.svc.getMessage(caregiver).message).toBeNull();
  });
});
