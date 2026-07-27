import { z } from '@hono/zod-openapi'

/**
 * The single error envelope every failure uses, described once so each route
 * can reference it instead of restating the shape.
 */
export const ErrorSchema = z
  .object({
    error: z.object({
      code: z
        .string()
        .openapi({ example: 'not_found', description: 'Stable, machine-readable code' }),
      message: z.string().openapi({ example: 'No user with id …' }),
      // Typed rather than `z.unknown()`: the latter emits `nullable` with no
      // `type`, which is invalid OpenAPI 3.0. This also matches what the app
      // actually puts here — validation issues, and nothing else.
      details: z
        .array(z.object({ path: z.string(), message: z.string() }))
        .optional()
        .openapi({ description: 'Per-field validation issues' }),
      requestId: z.string().optional().openapi({ example: '0c38e0ab-8f9c-4de0-97c2-b0ca3a939b18' }),
    }),
  })
  .openapi('Error')

/** Declares a JSON error response for a route. */
export function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: ErrorSchema } },
  }
}

/** Declares a JSON success response wrapped in the `{ data }` envelope. */
export function dataResponse<Schema extends z.ZodType>(schema: Schema, description: string) {
  return {
    description,
    content: { 'application/json': { schema: z.object({ data: schema }) } },
  }
}
