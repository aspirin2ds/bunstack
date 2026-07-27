import { sql } from 'drizzle-orm'
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
    /**
     * `sql\`now()\`` and not `new Date()`: the insert default is the *database's*
     * clock, so generating the update value from the *application's* clock
     * compares two independent clocks. With the app and Postgres in different
     * containers those differ by milliseconds, and `updatedAt` can land before
     * `createdAt` — which showed up as an integration test failing intermittently,
     * not as anything visible in review.
     *
     * `$onUpdate` accepts an SQL expression, so both timestamps now come from the
     * same clock and the ordering is guaranteed. This changes no DDL, so no
     * migration is needed.
     */
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  // RULES.md DB-06: `listUsers` sorts on this column. `id` and `email` are
  // already indexed by their primary-key and unique constraints; `created_at`
  // was not, so every listing sorted the whole table.
  (table) => [index('users_created_at_idx').on(table.createdAt)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
