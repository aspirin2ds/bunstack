import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Source of truth for the database shape. Edit here, then run
 * `bun run db:generate` to emit a migration into `drizzle/`.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // RULES.md DB-06: `listUsers` sorts on this column. `id` and `email` are
  // already indexed by their primary-key and unique constraints; `created_at`
  // was not, so every listing sorted the whole table.
  (table) => [index('users_created_at_idx').on(table.createdAt)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
