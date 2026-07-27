import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'internal'
  | 'timeout'

const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  internal: 500,
  timeout: 504,
}

/**
 * The only error type route and service code should throw deliberately.
 * `app.onError` turns these into the single JSON error shape; anything else
 * that escapes is treated as an unexpected 500 and its message is not exposed.
 */
export class AppError extends Error {
  override readonly name = 'AppError'

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }

  get status(): ContentfulStatusCode {
    return STATUS_BY_CODE[this.code]
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError('bad_request', message, details)
  }

  static notFound(message: string, details?: unknown) {
    return new AppError('not_found', message, details)
  }

  static conflict(message: string, details?: unknown) {
    return new AppError('conflict', message, details)
  }
}

/** Response body for every error this app returns. */
export interface ErrorBody {
  error: {
    code: ErrorCode
    message: string
    details?: unknown
    requestId?: string
  }
}

export function toErrorBody(error: AppError, requestId?: string): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
      ...(requestId === undefined ? {} : { requestId }),
    },
  }
}
