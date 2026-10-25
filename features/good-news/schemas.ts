import { z } from 'zod';
import { MESSAGE_MAX_CHARS } from './constants';

export const messageInput = z
  .object({ text: z.string().trim().min(1).max(MESSAGE_MAX_CHARS) })
  .strict();

/** One page of the paper. Plain text, no images; `url` links to the full story on the publisher's site. */
export interface Story {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string | null;
  /** Real stories only (https, the feed's own domain). Canned stories never get one. */
  url: string | null;
}

export interface CaregiverMessage {
  patientId: string;
  text: string;
  writtenBy: string;
  writtenAt: string;
}

/** Frozen for the day once built, so page numbers never shift while the patient is reading. */
export interface Edition {
  id: string;
  date: string; // YYYY-MM-DD, server-local
  builtAt: string;
  source: 'feeds' | 'canned' | 'none';
  stories: Story[];
}
