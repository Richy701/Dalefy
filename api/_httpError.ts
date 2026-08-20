/**
 * Error carrying an HTTP status for route handlers to send straight to the
 * client (mirrors ParseHttpError in _parseItineraryCore). An empty message
 * means "respond with this status and no body".
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorToHttp(err: unknown, fallback: string): { status: number; error: string } {
  if (err instanceof HttpError) return { status: err.status, error: err.message };
  return { status: 500, error: fallback };
}
