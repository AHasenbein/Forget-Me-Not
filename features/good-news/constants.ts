const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Fixed allowlist of good-news publishers' RSS feeds. The client can never supply a URL. "Scraping" here means
 * reading these feeds, not crawling arbitrary sites. All checked to serve fresh RSS (Oct 2026).
 */
export const FEEDS: readonly { name: string; url: string }[] = [
  { name: 'Good News Network', url: 'https://www.goodnewsnetwork.org/feed/' },
  { name: 'Positive News', url: 'https://www.positive.news/feed/' },
  { name: 'Reasons to be Cheerful', url: 'https://reasonstobecheerful.world/feed/' },
  { name: 'The Optimist Daily', url: 'https://www.optimistdaily.com/feed/' },
];

export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_FEED_BYTES = 1_500_000;
export const MAX_ITEMS_PER_FEED = 25;

/** One page per story: few enough to finish, each short enough to read in one go. */
export const PAPER_MAX_STORIES = 6;
export const STORY_MAX_AGE_MS = 4 * 24 * HOUR;
export const HEADLINE_MAX_CHARS = 140;
export const SUMMARY_MAX_CHARS = 280;

/** A failed fetch is retried on the next request after this, not on every request. */
export const RETRY_AFTER_FAILURE_MS = 10 * MIN;
export const REFRESH_EVERY_MS = 30 * MIN;

/** A caregiver message is shown for a day: a week-old "see you today" would mislead. */
export const MESSAGE_TTL_MS = 24 * HOUR;
export const MESSAGE_MAX_CHARS = 500;
