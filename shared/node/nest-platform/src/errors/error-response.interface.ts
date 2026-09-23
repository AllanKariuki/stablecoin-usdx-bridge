/**
 * The platform-wide error envelope. Every service that pulls in this
 * package returns exactly this shape for every error response, HttpException
 * or not — the direct counterpart of shared/go/platform/envelope.go's
 * ErrorResponse. Field names (including snake_case `request_id`) match the
 * Go side exactly: this is a wire contract shared across services, not an
 * internal DTO either side is free to reshape.
 */
export interface ErrorResponse {
  error: string;
  code: string;
  request_id: string;
}
