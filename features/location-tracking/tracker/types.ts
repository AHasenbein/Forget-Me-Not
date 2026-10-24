/** A raw position from the OS, before validation. Timestamps are epoch ms as expo-location reports them. */
export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  timestampMs: number;
  mocked?: boolean;
}

/** Wire format of POST /readings (see server/schema.ts). */
export interface Reading {
  lat: number;
  lng: number;
  accuracyM: number;
  recordedAt: string;
  source: 'gps' | 'network' | 'manual';
}

/**
 * ok: delivered. rejected: the server says the data is invalid (drop it, or it blocks the queue forever).
 * unauthorized: session expired or wrong role (keep the data). retry: offline or server trouble (keep the data).
 */
export type UploadResult = 'ok' | 'unauthorized' | 'retry' | 'rejected';

export interface Uploader {
  send(readings: Reading[]): Promise<UploadResult>;
}

/** Survives app restarts (AsyncStorage on device, memory in tests). */
export interface QueueStorage {
  load(): Promise<Reading[]>;
  save(readings: Reading[]): Promise<void>;
}

/** What the patient device can honestly say about itself. 'signed_out' needs a gentle re-login, not an error code. */
export type TrackerStatus = 'idle' | 'ok' | 'offline' | 'signed_out';
