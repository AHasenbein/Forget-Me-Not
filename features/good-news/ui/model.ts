/** Pure view logic for the morning paper (unit-tested; the .tsx files stay thin). */

export interface PaperStory {
  id: string;
  headline: string;
  summary: string;
  source: string;
}
export interface Paper {
  editionId: string;
  date: string;
  now: string;
  message: { text: string; writtenAt: string } | null;
  stories: PaperStory[];
  /** Money-safety tip of the day (last page). Optional so an older API still renders. */
  tip?: string;
}

export type Page =
  | { kind: 'message'; text: string; when: string }
  | { kind: 'story'; headline: string; summary: string; source: string }
  | { kind: 'empty' }
  | { kind: 'tip'; text: string };

/** The caregiver's message first (if any), then one story per page, then the money tip. Never zero pages. */
export function buildPages(p: Paper): Page[] {
  const pages: Page[] = [];
  if (p.message)
    pages.push({
      kind: 'message',
      text: p.message.text,
      when: whenLabel(p.message.writtenAt, p.now),
    });
  for (const s of p.stories)
    pages.push({ kind: 'story', headline: s.headline, summary: s.summary, source: s.source });
  if (!p.stories.length) pages.push({ kind: 'empty' });
  if (p.tip) pages.push({ kind: 'tip', text: p.tip });
  return pages;
}

/** Plain words, no clock times: "Just now", "This morning", "Yesterday". */
export function whenLabel(writtenAt: string, nowIso: string): string {
  const w = new Date(writtenAt);
  const n = new Date(nowIso);
  if (n.getTime() - w.getTime() < 15 * 60_000) return 'Just now';
  const sameDay = w.toDateString() === n.toDateString();
  if (!sameDay) return 'Yesterday';
  const h = w.getHours();
  return h < 12 ? 'This morning' : h < 18 ? 'This afternoon' : 'This evening';
}

export const clampPage = (page: number, total: number) =>
  Math.min(Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0), Math.max(0, total - 1));

/** "Monday 25 October" from the edition date (YYYY-MM-DD), without trusting the device clock. */
export function dateLine(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** What AsyncStorage remembers: where the patient stopped, per edition. A new edition starts at page 1. */
export interface Progress {
  editionId: string;
  page: number;
  opened: boolean;
}
export function readProgress(raw: string | null, editionId: string): Progress {
  try {
    const p = JSON.parse(raw ?? '') as Partial<Progress>;
    if (p.editionId === editionId)
      return { editionId, page: Number(p.page) || 0, opened: p.opened === true };
  } catch {
    // nothing stored, or junk: start fresh
  }
  return { editionId, page: 0, opened: false };
}
