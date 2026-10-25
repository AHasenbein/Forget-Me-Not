import { describe, expect, it } from 'vitest';
import { FakeClock } from '@core/testing';
import { isGentle, selectStories } from '../../filter';
import { decodeEntities, parseRss, shorten, toPlainText } from '../../rss';
import { createFeedSource } from '../../sources';

const item = (title: string, desc: string, date: string) =>
  `<item><title>${title}</title><description><![CDATA[${desc}]]></description><pubDate>${date}</pubDate></item>`;
const feed = (...items: string[]) =>
  `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
const clock = new FakeClock('2026-10-25T12:00:00Z');
const recent = 'Sat, 24 Oct 2026 17:19:53 +0000';

describe('rss parsing', () => {
  it('reads titles, CDATA descriptions and dates, and strips HTML, entities and the WordPress footer', () => {
    const [i] = parseRss(
      feed(
        item(
          'Star Clusters in Van Gogh&#8217;s Starry Night &amp; More',
          '<p>The sky he painted <b>matches</b> July 1889. It is lovely.</p><p>The post <a href="x">Star</a> appeared first on <a href="y">GNN</a>.</p>',
          recent,
        ),
      ),
      'Good News Network',
    );
    expect(i).toEqual({
      title: 'Star Clusters in Van Gogh’s Starry Night & More',
      summary: 'The sky he painted matches July 1889. It is lovely.',
      publishedAt: '2026-10-24T17:19:53.000Z',
      source: 'Good News Network',
    });
  });

  it('never lets markup or scripts through, and caps the summary at two sentences', () => {
    expect(toPlainText('<script>alert(1)</script>Hi <img src=x onerror=y> there')).toBe('Hi there');
    expect(decodeEntities('&lt;b&gt; &#x1F600; &bogus;')).toBe('<b> \u{1F600} &bogus;');
    expect(shorten('One. Two. Three.', 280)).toBe('One. Two.');
    expect(shorten('The U.S. opened a new park. Families love it. More soon.', 280)).toBe(
      'The U.S. opened a new park. Families love it.',
    );
    const [i] = parseRss(feed(item('New U.S. Park Opens. Families Visit', 'x', recent)), 'S');
    expect(i!.title).toBe('New U.S. Park Opens. Families Visit'); // headlines are never sentence-cut
    expect(shorten('word '.repeat(100), 30).length).toBeLessThanOrEqual(31);
  });

  it('drops bylines and labels some feeds put first', () => {
    expect(toPlainText('BY THE OPTIMIST DAILY EDITORIAL TEAM It is harvest time.')).toBe(
      'It is harvest time.',
    );
    expect(toPlainText('Episode Description: Germany built a turbine.')).toBe(
      'Germany built a turbine.',
    );
  });

  it('skips malformed items instead of throwing', () => {
    expect(parseRss('<rss><item><title></title></item><item>broken', 'x')).toEqual([]);
    expect(parseRss('not xml at all', 'x')).toEqual([]);
  });
});

describe('patient-safety filter', () => {
  it('drops distressing stories even from good-news feeds', () => {
    for (const t of [
      'Cancer survivor runs a marathon',
      'Dog rescued after car crash',
      'Town remembers those who died in the war',
      'New hope for dementia patients',
      'Country repeals an old law',
      'Youth saves 18 kids after bus driver has a seizure',
      'Podcast transcript: this week in good news',
    ])
      expect(isGentle({ title: t, summary: '' })).toBe(false);
    expect(
      isGentle({
        title: 'Ducklings cross Main Street',
        summary: 'Traffic stopped to let them pass.',
      }),
    ).toBe(true);
  });

  it('keeps only recent stories, removes duplicates, mixes publishers and caps the paper at 6', () => {
    const raw = [
      ...Array.from({ length: 8 }, (_, n) => ({
        title: `Happy story number ${n}`,
        summary: '',
        publishedAt: new Date(clock.now().getTime() - n * 3_600_000).toISOString(),
        source: n % 2 ? 'A' : 'B',
      })),
      {
        title: 'Happy story number 0',
        summary: '',
        publishedAt: clock.now().toISOString(),
        source: 'C',
      },
      { title: 'Old news', summary: '', publishedAt: '2026-01-01T00:00:00Z', source: 'C' },
      { title: 'No date', summary: '', publishedAt: null, source: 'C' },
    ];
    const picked = selectStories(raw, clock.now());
    expect(picked).toHaveLength(6);
    expect(new Set(picked.map((s) => s.headline)).size).toBe(6);
    expect(picked.map((s) => s.headline)).not.toContain('Old news');
    expect(new Set(picked.slice(0, 2).map((s) => s.source)).size).toBe(2); // interleaved
  });
});

describe('feed source', () => {
  const ok = (body: string) => new Response(body, { status: 200 });
  const feeds = [
    { name: 'One', url: 'https://one.example/feed' },
    { name: 'Two', url: 'https://two.example/feed' },
  ];

  it('uses the feeds that answer and skips the ones that fail', async () => {
    const fetchFn = (async (url: string) =>
      url.includes('one')
        ? ok(feed(item('Kind neighbour fixes bikes', 'Nice.', recent)))
        : new Response('', { status: 500 })) as unknown as typeof fetch;
    const stories = await createFeedSource({ fetch: fetchFn, feeds }).stories(clock.now());
    expect(stories.map((s) => s.headline)).toEqual(['Kind neighbour fixes bikes']);
  });

  it('throws when no feed is reachable, and refuses oversized feeds', async () => {
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(createFeedSource({ fetch: down, feeds }).stories(clock.now())).rejects.toThrow();
    const huge = (async () => ok('x'.repeat(1_600_000))) as unknown as typeof fetch;
    await expect(createFeedSource({ fetch: huge, feeds }).stories(clock.now())).rejects.toThrow();
  });
});
