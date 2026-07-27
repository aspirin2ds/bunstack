import { Hono } from 'hono'
import { z } from 'zod'

import { validate } from '../lib/validate.ts'
import * as usersService from '../services/users.ts'

const IdParam = z.object({ id: z.uuid() })

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const CreateUserBody = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(200),
})

// `.partial()` keeps update in sync with create automatically; the service
// rejects an empty object.
const UpdateUserBody = CreateUserBody.partial()

/**
 * Routes are chained in a single expression on purpose — Hono's `hc` RPC client
 * only infers types from a chained builder.
 * https://hono.dev/docs/guides/best-practices
 */
export const usersRoutes = new Hono()
  .get('/', validate('query', ListQuery), async (c) => {
    const data = await usersService.listUsers(c.req.valid('query'))
    return c.json({ data })
  })
  .post('/', validate('json', CreateUserBody), async (c) => {
    const data = await usersService.createUser(c.req.valid('json'))
    return c.json({ data }, 201)
  })
  .get('/:id', validate('param', IdParam), async (c) => {
    const data = await usersService.getUser(c.req.valid('param').id)
    return c.json({ data })
  })
  .patch(
    '/:id',
    validate('param', IdParam),
    validate('json', UpdateUserBody),
    async (c) => {
      const data = await usersService.updateUser(c.req.valid('param').id, c.req.valid('json'))
      return c.json({ data })
    },
  )
  .delete('/:id', validate('param', IdParam), async (c) => {
    await usersService.deleteUser(c.req.valid('param').id)
    return c.body(null, 204)
  })
