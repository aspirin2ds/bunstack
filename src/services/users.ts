import { asc, eq } from 'drizzle-orm'

import { db, isUniqueViolation } from '../db/index.ts'
import { users, type User } from '../db/schema.ts'
import { AppError } from '../lib/errors.ts'

/**
 * Business logic for users. Deliberately free of Hono types: everything here
 * takes plain input and throws `AppError`, so it is callable and testable
 * without an HTTP context.
 */

export interface CreateUserInput {
  email: string
  name: string
}

export type UpdateUserInput = Partial<CreateUserInput>

export interface ListUsersOptions {
  limit: number
  offset: number
}

export async function listUsers({ limit, offset }: ListUsersOptions): Promise<User[]> {
  return db.select().from(users).orderBy(asc(users.createdAt)).limit(limit).offset(offset)
}

export async function getUser(id: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)

  if (!user) throw AppError.notFound(`No user with id ${id}`)

  return user
}

export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    const [user] = await db.insert(users).values(input).returning()

    // `.returning()` on a successful single insert always yields a row; this
    // narrows the type rather than guarding against a real condition.
    if (!user) throw new Error('insert returned no row')

    return user
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(`A user with email ${input.email} already exists`)
    }
    throw error
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  if (Object.keys(input).length === 0) {
    throw AppError.badRequest('No fields to update')
  }

  try {
    const [user] = await db.update(users).set(input).where(eq(users.id, id)).returning()

    if (!user) throw AppError.notFound(`No user with id ${id}`)

    return user
  } catch (error) {
    if (isUniqueViolation(error)) {
      // `email` is the only unique column, so a violation is always that.
      // Guarded because a name-only update has no `input.email` to name.
      throw AppError.conflict(
        input.email
          ? `A user with email ${input.email} already exists`
          : 'That email is already taken',
      )
    }
    throw error
  }
}

export async function deleteUser(id: string): Promise<void> {
  const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })

  if (deleted.length === 0) throw AppError.notFound(`No user with id ${id}`)
}
