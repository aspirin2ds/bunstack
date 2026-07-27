import { defineConfig } from 'drizzle-kit'

/**
 * `Bun.env` (RULES.md BUN-01) — which only works because the
 * `db:generate` script runs **`bunx --bun drizzle-kit`**.
 *
 * `drizzle-kit` ships a Node shebang, so plain `bunx drizzle-kit` executes it under
 * Node, where the `Bun` global does not exist and this file dies with a bare
 * `Bun is not defined` that reads like a broken config. `--bun` forces bunx to run
 * the CLI with the Bun runtime instead. Verified both ways on drizzle-kit 0.31.10:
 * with `--bun` it reads the schema correctly, without it, it throws.
 *
 * Keep the `--bun` flag on any drizzle-kit invocation you add.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: Bun.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
