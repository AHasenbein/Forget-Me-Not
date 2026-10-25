import { describe, expect, it } from 'vitest';
import { buildPages, clampPage, dateLine, readProgress, whenLabel } from '../../ui/model';

const paper = (message: boolean, stories: number) => ({
  editionId: 'e1',
  date: '2026-10-25',
  now: '2026-10-25T09:00:00',
  message: message ? { text: 'Hello', writtenAt: '2026-10-25T08:00:00' } : null,
  stories: Array.from({ length: stories }, (_, i) => ({
    id: `${i}`,
    headline: `H${i}`,
    summary: '',
    source: 'S',
  })),
});

describe('paper view model', () => {
  it('puts the message first, then one story per page, and never has zero pages', () => {
    expect(buildPages(paper(true, 2)).map((p) => p.kind)).toEqual(['message', 'story', 'story']);
    expect(buildPages(paper(false, 1)).map((p) => p.kind)).toEqual(['story']);
    expect(buildPages(paper(true, 0)).map((p) => p.kind)).toEqual(['message', 'empty']);
  });

  it('ends with the money tip of the day, after the stories (or the "no news" page)', () => {
    const withTip = (m: boolean, n: number) => ({ ...paper(m, n), tip: 'Keep your PIN secret.' });
    expect(buildPages(withTip(true, 2)).map((p) => p.kind)).toEqual([
      'message',
      'story',
      'story',
      'tip',
    ]);
    expect(buildPages(withTip(false, 0)).map((p) => p.kind)).toEqual(['empty', 'tip']);
  });

  it('labels times in plain words', () => {
    expect(whenLabel('2026-10-25T08:55:00', '2026-10-25T09:00:00')).toBe('Just now');
    expect(whenLabel('2026-10-25T08:00:00', '2026-10-25T09:00:00')).toBe('This morning');
    expect(whenLabel('2026-10-24T20:00:00', '2026-10-25T09:00:00')).toBe('Yesterday');
  });

  it('resumes the saved page for the same edition only, and clamps bad values', () => {
    expect(readProgress('{"editionId":"e1","page":3,"opened":true}', 'e1')).toEqual({
      editionId: 'e1',
      page: 3,
      opened: true,
    });
    expect(readProgress('{"editionId":"old","page":3,"opened":true}', 'e1')).toEqual({
      editionId: 'e1',
      page: 0,
      opened: false,
    });
    expect(readProgress('junk', 'e1').page).toBe(0);
    expect(clampPage(9, 3)).toBe(2);
    expect(clampPage(-1, 3)).toBe(0);
    expect(dateLine('2026-10-25')).toBe('Sunday 25 October');
  });
});
