/**
 * Applies pending migrations from `drizzle/`, then exits.
 *
 * Run manually with `bun run db:migrate`. The app container also runs this on
 * start, so a fresh `docker compose up` comes up with a migrated database.
 */
import { migrate } from 'drizzle-orm/bun-sql/migrator'

import { logger } from '../lib/logger.ts'
import { db } from './index.ts'

await migrate(db, { migrationsFolder: './drizzle' })

// RULES.md LOG-01: structured even here — this runs as its own container in
// compose, so its output lands in the same log stream as the app's.
logger.info('migrations up to date')

process.exit(0)
