import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodType } from 'zod'

import { AppError } from './errors.ts'

/**
 * `zValidator` with a hook that throws `AppError` instead of letting the
 * middleware emit its own response shape, so validation failures come back in
 * the same envelope as every other error. Use this in routes, not `zValidator`
 * directly.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw AppError.badRequest(
        `Invalid request ${target}`,
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      )
    }
  })
}
