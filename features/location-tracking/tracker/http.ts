import type { Reading, UploadResult, Uploader } from './types';

export interface HttpUploaderDeps {
  baseUrl: string;
  /** Current session token, or null when signed out. */
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

/** Maps HTTP outcomes onto what the queue should do with the data. Bodies are never logged. */
export function createHttpUploader({
  baseUrl,
  getToken,
  fetchImpl = fetch,
}: HttpUploaderDeps): Uploader {
  return {
    async send(readings: Reading[]): Promise<UploadResult> {
      const token = await getToken();
      if (!token) return 'unauthorized';
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/api/location-tracking/readings`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ readings }),
        });
      } catch {
        return 'retry'; // offline
      }
      if (res.ok) return 'ok';
      if (res.status === 401 || res.status === 403) return 'unauthorized';
      if (res.status === 400 || res.status === 413 || res.status === 422) return 'rejected';
      return 'retry';
    },
  };
}
