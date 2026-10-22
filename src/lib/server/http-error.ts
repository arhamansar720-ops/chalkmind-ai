export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}
