import type { Hook } from '@hono/zod-validator'
import type { Env } from 'hono'

import { AppError } from './errors.ts'

/**
 * Keeps every Zod validation failure in the API's shared error envelope.
 * Pass this hook to each `zValidator()` in the route chain.
 */
type ValidationResult = Parameters<Hook<unknown, Env, string>>[0]

export const validationHook = ((result: ValidationResult) => {
  if (!result.success && result.error) {
    throw AppError.badRequest(
      `Invalid request ${result.target}`,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }
}) satisfies Hook<unknown, Env, string>
