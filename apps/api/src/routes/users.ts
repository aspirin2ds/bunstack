import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AppEnv } from '../lib/context.ts'
import { validationHook } from '../lib/validation.ts'
// RULES.md ARCH-01: the type comes from the service, not `db/`. Routes depend
// on what the service returns, so a future DTO changes nothing here.
import type { User } from '../services/users.ts'
import * as usersService from '../services/users.ts'

/**
 * The service layer deals in `Date`; the HTTP boundary serializes timestamps to
 * ISO strings. Hono infers this return shape directly for the TypeScript client.
 */
function toResponse(user: User) {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

const IdParam = z.object({
  id: z.uuid(),
})

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const CreateUserBody = z.object({
  // RULES.md VAL-04: 254 is the RFC 5321 maximum. Without a bound the body
  // limit is the only thing standing between you and a megabyte "email".
  email: z.email().max(254),
  name: z.string().trim().min(1).max(200),
})

// Keeps update in sync with create automatically; the service rejects `{}`.
const UpdateUserBody = CreateUserBody.partial()

/**
 * Chained in a single expression so `hc` RPC types infer.
 * https://hono.dev/docs/guides/best-practices
 */
export const usersRoutes = new Hono<AppEnv>()
  .get('/', zValidator('query', ListQuery, validationHook), async (c) => {
    const users = await usersService.listUsers(c.req.valid('query'))
    return c.json({ data: users.map(toResponse) }, 200)
  })
  .post('/', zValidator('json', CreateUserBody, validationHook), async (c) => {
    const user = await usersService.createUser(c.req.valid('json'))
    return c.json({ data: toResponse(user) }, 201)
  })
  .get('/:id', zValidator('param', IdParam, validationHook), async (c) => {
    const user = await usersService.getUser(c.req.valid('param').id)
    return c.json({ data: toResponse(user) }, 200)
  })
  .patch(
    '/:id',
    zValidator('param', IdParam, validationHook),
    zValidator('json', UpdateUserBody, validationHook),
    async (c) => {
      const user = await usersService.updateUser(c.req.valid('param').id, c.req.valid('json'))
      return c.json({ data: toResponse(user) }, 200)
    },
  )
  .delete('/:id', zValidator('param', IdParam, validationHook), async (c) => {
    await usersService.deleteUser(c.req.valid('param').id)
    return c.body(null, 204)
  })
