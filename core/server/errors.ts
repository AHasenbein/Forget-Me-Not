/**
 * Throw from a route handler to return a specific status. Only `code` reaches the client
 * (stable, machine-readable, no PII). Anything else a handler throws becomes a generic 500.
 */
export type HttpStatus = 400 | 403 | 404 | 409 | 413 | 422 | 429;

export class HttpError extends Error {
  constructor(
    readonly status: HttpStatus,
    readonly code: string,
  ) {
    super(code);
  }
}
