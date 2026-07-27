/**
 * Applies pending migrations from `drizzle/`, then exits.
 *
 * Run manually with `bun run db:migrate`. The app container also runs this on
 * start, so a fresh `docker compose up` comes up with a migrated database.
 */
import { migrate } from 'drizzle-orm/bun-sql/migrator'

import { db } from './index.ts'

await migrate(db, { migrationsFolder: './drizzle' })

console.log('migrations up to date')

process.exit(0)
