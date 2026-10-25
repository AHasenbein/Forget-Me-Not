import { HEADLINE_MAX_CHARS, MAX_ITEMS_PER_FEED, SUMMARY_MAX_CHARS } from './constants';

export interface RawItem {
  title: string;
  summary: string;
  publishedAt: string | null; // ISO
  source: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Feed text is untrusted: no markup survives, only plain words. */
export function toPlainText(s: string): string {
  const text = decodeEntities(
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  );
  return (
    text
      // WordPress footer: "The post X appeared first on Y."
      .replace(/\bThe post\b[\s\S]*?\bappeared first on\b[\s\S]*$/i, '')
      .replace(/\[(…|\.\.\.)\]/g, '…')
      // Bylines and labels some feeds put first: "BY THE OPTIMIST DAILY EDITORIAL TEAM", "Episode Description:".
      .replace(/^\s*(BY|By) [A-Z][A-Z .'’-]{2,60}?(TEAM|STAFF|EDITORS?|DESK)\b\s*/, '')
      .replace(/^\s*(episode description|description|summary|editor'?s note)\s*:\s*/i, '')
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Up to `sentences` sentences, never more than `max` characters, cut at a word. A sentence ends after a word of two or
 * more letters, so abbreviations like "U.S." or "Dr." do not cut it short.
 */
export function shorten(s: string, max: number, sentences = 2): string {
  const parts = s.split(/(?<=[a-z0-9]{2}[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/);
  let out = parts.slice(0, sentences).join(' ').trim();
  if (out.length > max) out = `${out.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return out;
}

/** Headlines are never split into sentences, only length-capped. */
const capLength = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, '')}…` : s;

const tag = (block: string, name: string) =>
  new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block)?.[1] ?? '';

/** Minimal RSS 2.0 reader: titles, descriptions and dates. Anything malformed is skipped, never thrown. */
export function parseRss(xml: string, source: string): RawItem[] {
  const items: RawItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    if (items.length >= MAX_ITEMS_PER_FEED) break;
    const block = m[1] ?? '';
    const title = capLength(toPlainText(tag(block, 'title')), HEADLINE_MAX_CHARS);
    const summary = shorten(toPlainText(tag(block, 'description')), SUMMARY_MAX_CHARS);
    if (!title) continue;
    const t = Date.parse(toPlainText(tag(block, 'pubDate')));
    items.push({
      title,
      summary,
      publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
      source,
    });
  }
  return items;
}
