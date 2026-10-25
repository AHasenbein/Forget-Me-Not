import { PAPER_MAX_STORIES, STORY_MAX_AGE_MS } from './constants';
import type { RawItem } from './rss';
import type { Story } from './schemas';

/**
 * Even "good news" feeds carry stories about illness, death, war or crime ("cancer survivor runs marathon"). For a
 * reader with dementia a single distressing page outweighs a missing happy one, so anything matching is dropped.
 * Fewer stories beats one upsetting story.
 */
const DISTRESSING =
  /\b(death|deaths|dead|die[sd]?|dying|killed|kill(s|ing)?|murder\w*|war|wars|warfare|bomb\w*|shoot\w*|shot|gun\w*|cancer|tumou?r|disease|dementia|alzheimer\w*|stroke|funeral|grief|griev\w*|mourn\w*|missing|kidnap\w*|abuse\w*|assault\w*|attack\w*|terror\w*|crash\w*|accident\w*|injur\w*|wound\w*|hospital\w*|surgery|overdose|suicide|refugee\w*|famine|earthquake|flood\w*|wildfire\w*|hurricane\w*|tornado\w*|disaster\w*|crisis|pandemic|virus|covid|layoff\w*|bankrupt\w*|scam\w*|fraud\w*|arrest\w*|prison\w*|jail\w*|poverty|homeless\w*|extinct\w*|climate change|politic\w*|election\w*|trump|biden|harris|law|laws|legislat\w*|repeal\w*|court|courts|lawsuit\w*|government\w*|parliament\w*|congress\w*|senate|protest\w*|resistance|activis\w*|artivis\w*|seizure\w*|runaway|emergenc\w*|danger\w*|rescu\w*|survivor\w*|podcast\w*|transcript\w*|episode\w*|webinar\w*|canvass\w*|campaign\w*|vote|votes|voter\w*|voting|ballot\w*)\b/i;

export const isGentle = (i: Pick<RawItem, 'title' | 'summary'>) =>
  !DISTRESSING.test(`${i.title} ${i.summary}`);

const key = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .slice(0, 8)
    .join(' ');

/** Recent, gentle, de-duplicated, newest first, sources interleaved so one publisher does not fill the paper. */
export function selectStories(items: readonly RawItem[], now: Date): Story[] {
  const seen = new Set<string>();
  const fresh = items
    .filter((i) => i.publishedAt && now.getTime() - Date.parse(i.publishedAt) <= STORY_MAX_AGE_MS)
    .filter((i) => Date.parse(i.publishedAt!) <= now.getTime() + 60 * 60_000) // not from the future
    .filter(isGentle)
    .filter((i) => {
      const k = key(i.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));

  const bySource = new Map<string, RawItem[]>();
  for (const i of fresh) bySource.set(i.source, [...(bySource.get(i.source) ?? []), i]);
  const picked: RawItem[] = [];
  while (picked.length < PAPER_MAX_STORIES && [...bySource.values()].some((l) => l.length)) {
    for (const list of bySource.values()) {
      const next = list.shift();
      if (next && picked.length < PAPER_MAX_STORIES) picked.push(next);
    }
  }
  return picked.map((i, n) => ({
    id: `s${n + 1}`,
    headline: i.title,
    summary: i.summary,
    source: i.source,
    publishedAt: i.publishedAt,
  }));
}
