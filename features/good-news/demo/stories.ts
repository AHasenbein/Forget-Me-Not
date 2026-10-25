import type { Story } from '../schemas';

/** Fictional, gentle stories for demo mode and tests. The first few headlines come from the shared demo world. */
const SUMMARIES = [
  'Neighbours planted roses and benches around the new reading room. Anyone can sit and read there among the flowers.',
  'Tulips and daffodils are blooming along the paths. The gardeners say it is the most colourful spring in years.',
  'The choir has been practising favourite old songs. Everyone is welcome to come and sing along.',
];
const EXTRA: Omit<Story, 'id' | 'publishedAt' | 'url'>[] = [
  {
    headline: 'A family of ducks crosses Main Street, and traffic stops to let them pass',
    summary:
      'A mother duck led her eight ducklings safely to the pond. People cheered from the pavement.',
    source: 'Springfield Gazette',
  },
  {
    headline: 'School children knit warm scarves for their grandparents',
    summary:
      'The class learned to knit this autumn. Each child made a scarf in their grandparent’s favourite colour.',
    source: 'Springfield Gazette',
  },
  {
    headline: 'The town bakery celebrates 50 years with free cinnamon buns',
    summary:
      'The bakery opened in 1976. On Saturday everyone who visits gets a warm bun and a cup of tea.',
    source: 'Springfield Gazette',
  },
];

export function cannedStories(now: Date, worldHeadlines: readonly string[]): Story[] {
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const fromWorld = worldHeadlines.slice(0, SUMMARIES.length).map((headline, i) => ({
    headline,
    summary: SUMMARIES[i]!,
    source: 'Springfield Gazette',
  }));
  return [...fromWorld, ...EXTRA].map((s, i) => ({
    ...s,
    id: `demo-${i + 1}`,
    publishedAt: at(i + 1),
    url: null, // fictional: never a real-looking link
  }));
}
