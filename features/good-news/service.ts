import type { AuthUser } from '@core/auth/types';
import { HttpError } from '@core/server/errors';
import { MESSAGE_TTL_MS, RETRY_AFTER_FAILURE_MS } from './constants';
import type { Edition, Story } from './schemas';
import type { NewsSource } from './sources';
import type { MessageStore } from './store';
import { tipFor } from './tips';

export interface GoodNewsDeps {
  store: MessageStore;
  source: NewsSource;
  /** Used only when `source` fails or finds nothing. Demo wiring passes canned stories; live passes null. */
  fallback: NewsSource | null;
  now: () => Date;
}

/** Server-local calendar date: one edition per day. */
export const editionDate = (t: Date) => t.toLocaleDateString('en-CA');

export function createGoodNewsService({ store, source, fallback, now }: GoodNewsDeps) {
  let edition: Edition | undefined;
  let lastFailureAt = Number.NEGATIVE_INFINITY;
  let building: Promise<Edition> | undefined;

  const patientOf = (user: AuthUser): string => {
    if (!user.patientId) throw new HttpError(403, 'not_linked');
    return user.patientId;
  };
  const requireRole = (user: AuthUser, ...roles: AuthUser['role'][]) => {
    if (!roles.includes(user.role)) throw new HttpError(403, 'forbidden');
  };

  async function build(t: Date): Promise<Edition> {
    const date = editionDate(t);
    let stories: Story[] = [];
    let from: Edition['source'] = 'none';
    try {
      stories = await source.stories(t);
      from = source.kind;
    } catch {
      lastFailureAt = t.getTime();
    }
    if (!stories.length && fallback) {
      stories = await fallback.stories(t).catch(() => []);
      from = stories.length ? fallback.kind : 'none';
    }
    // Live and nothing new: keep the last good paper rather than an empty one.
    if (!stories.length && edition?.stories.length) return edition;
    return {
      id: `${date}-${from}-${stories.length}`,
      date,
      builtAt: t.toISOString(),
      source: from,
      stories,
    };
  }

  /** Today's edition, built at most once per day (retried after a failure, never on every request). */
  async function current(): Promise<Edition> {
    const t = now();
    const today = editionDate(t);
    const fresh = edition?.date === today && edition.stories.length > 0;
    const coolingDown = t.getTime() - lastFailureAt < RETRY_AFTER_FAILURE_MS;
    if (edition && (fresh || (edition.date === today && coolingDown))) return edition;
    building ??= build(t)
      .then((e) => (edition = e))
      .finally(() => (building = undefined));
    return building;
  }

  const activeMessage = (patientId: string) => {
    const m = store.get(patientId);
    if (!m || now().getTime() - Date.parse(m.writtenAt) >= MESSAGE_TTL_MS) return null;
    return { text: m.text, writtenAt: m.writtenAt };
  };

  const messageView = (user: AuthUser) => {
    requireRole(user, 'primary_caregiver');
    const m = store.get(patientOf(user));
    if (!m) return { message: null, shownToPatient: false };
    const expiresAt = new Date(Date.parse(m.writtenAt) + MESSAGE_TTL_MS).toISOString();
    return {
      message: { text: m.text, writtenAt: m.writtenAt, expiresAt },
      shownToPatient: now().toISOString() < expiresAt,
    };
  };

  return {
    /** What the patient reads (the caregiver may preview it). The caregiver's message comes first, if any. */
    async paper(user: AuthUser) {
      requireRole(user, 'patient', 'primary_caregiver');
      const patientId = patientOf(user);
      const e = await current();
      return {
        editionId: e.id,
        date: e.date,
        now: now().toISOString(),
        message: activeMessage(patientId),
        stories: e.stories,
        tip: tipFor(e.date),
      };
    },

    getMessage: (user: AuthUser) => messageView(user),

    /** Replaces any earlier message; it shows for MESSAGE_TTL_MS from now. */
    setMessage(user: AuthUser, text: string) {
      requireRole(user, 'primary_caregiver');
      store.put({
        patientId: patientOf(user),
        text,
        writtenBy: user.id,
        writtenAt: now().toISOString(),
      });
      return messageView(user);
    },

    clearMessage(user: AuthUser) {
      requireRole(user, 'primary_caregiver');
      store.delete(patientOf(user));
      return { message: null, shownToPatient: false };
    },

    /** Job: pre-builds the day's edition so the patient never waits on the feeds. */
    async refresh() {
      const e = await current();
      return { editionId: e.id, stories: e.stories.length };
    },
  };
}

export type GoodNewsService = ReturnType<typeof createGoodNewsService>;
