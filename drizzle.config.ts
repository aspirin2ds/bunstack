import { defineConfig } from 'drizzle-kit'

// Bun loads .env automatically, so no dotenv import is needed here.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
