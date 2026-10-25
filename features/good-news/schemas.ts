import { z } from 'zod';
import { MESSAGE_MAX_CHARS } from './constants';

export const messageInput = z
  .object({ text: z.string().trim().min(1).max(MESSAGE_MAX_CHARS) })
  .strict();

/** One page of the paper. Plain text only; no links, no images. */
export interface Story {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string | null;
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
