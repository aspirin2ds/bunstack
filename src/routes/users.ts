import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

import type { User } from '../db/schema.ts'
import { dataResponse, errorResponse } from '../lib/openapi.ts'
import * as usersService from '../services/users.ts'

const EXAMPLE_ID = '3f6d1b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

/**
 * The wire representation of a user. Timestamps are ISO strings here while the
 * service layer deals in `Date`, so `toResponse` does the conversion — and the
 * response schema type-checks that it actually happened.
 */
const UserSchema = z
  .object({
    id: z.uuid().openapi({ example: EXAMPLE_ID }),
    email: z.email().openapi({ example: 'ada@example.com' }),
    name: z.string().openapi({ example: 'Ada Lovelace' }),
    createdAt: z.iso.datetime().openapi({ example: '2026-01-01T00:00:00.000Z' }),
    updatedAt: z.iso.datetime().openapi({ example: '2026-01-01T00:00:00.000Z' }),
  })
  .openapi('User')

function toResponse(user: User): z.infer<typeof UserSchema> {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

const IdParam = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, example: EXAMPLE_ID }),
})

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
  offset: z.coerce.number().int().min(0).default(0).openapi({ example: 0 }),
})

const CreateUserBody = z
  .object({
    email: z.email().openapi({ example: 'ada@example.com' }),
    name: z.string().trim().min(1).max(200).openapi({ example: 'Ada Lovelace' }),
  })
  .openapi('CreateUser')

// Keeps update in sync with create automatically; the service rejects `{}`.
const UpdateUserBody = CreateUserBody.partial().openapi('UpdateUser')

const jsonBody = <Schema extends z.ZodType>(schema: Schema) => ({
  content: { 'application/json': { schema } },
  required: true,
})

const list = createRoute({
  method: 'get',
  operationId: 'listUsers',
  path: '/',
  tags: ['Users'],
  summary: 'List users',
  request: { query: ListQuery },
  responses: {
    200: dataResponse(z.array(UserSchema), 'A page of users, oldest first'),
    400: errorResponse('Invalid pagination parameters'),
  },
})

const create = createRoute({
  method: 'post',
  operationId: 'createUser',
  path: '/',
  tags: ['Users'],
  summary: 'Create a user',
  request: { body: jsonBody(CreateUserBody) },
  responses: {
    201: dataResponse(UserSchema, 'The created user'),
    400: errorResponse('Invalid body'),
    409: errorResponse('That email is already taken'),
    413: errorResponse('Body too large'),
  },
})

const getOne = createRoute({
  method: 'get',
  operationId: 'getUser',
  path: '/{id}',
  tags: ['Users'],
  summary: 'Fetch a user by id',
  request: { params: IdParam },
  responses: {
    200: dataResponse(UserSchema, 'The requested user'),
    400: errorResponse('Malformed id'),
    404: errorResponse('No such user'),
  },
})

const update = createRoute({
  method: 'patch',
  operationId: 'updateUser',
  path: '/{id}',
  tags: ['Users'],
  summary: 'Update a user',
  description: 'Partial update. At least one field must be supplied.',
  request: { params: IdParam, body: jsonBody(UpdateUserBody) },
  responses: {
    200: dataResponse(UserSchema, 'The updated user'),
    400: errorResponse('Malformed id, or no fields to update'),
    404: errorResponse('No such user'),
    409: errorResponse('That email is already taken'),
  },
})

const remove = createRoute({
  method: 'delete',
  operationId: 'deleteUser',
  path: '/{id}',
  tags: ['Users'],
  summary: 'Delete a user',
  request: { params: IdParam },
  responses: {
    204: { description: 'Deleted' },
    400: errorResponse('Malformed id'),
    404: errorResponse('No such user'),
  },
})

/**
 * Chained in a single expression so `hc` RPC types infer.
 * https://hono.dev/docs/guides/best-practices
 */
export const usersRoutes = new OpenAPIHono()
  .openapi(list, async (c) => {
    const users = await usersService.listUsers(c.req.valid('query'))
    return c.json({ data: users.map(toResponse) }, 200)
  })
  .openapi(create, async (c) => {
    const user = await usersService.createUser(c.req.valid('json'))
    return c.json({ data: toResponse(user) }, 201)
  })
  .openapi(getOne, async (c) => {
    const user = await usersService.getUser(c.req.valid('param').id)
    return c.json({ data: toResponse(user) }, 200)
  })
  .openapi(update, async (c) => {
    const user = await usersService.updateUser(c.req.valid('param').id, c.req.valid('json'))
    return c.json({ data: toResponse(user) }, 200)
  })
  .openapi(remove, async (c) => {
    await usersService.deleteUser(c.req.valid('param').id)
    return c.body(null, 204)
  })
