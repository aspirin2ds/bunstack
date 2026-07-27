import { app } from './app.ts'
import { env } from './env.ts'
import { logger } from './lib/logger.ts'

/**
 * `Bun.serve` closes idle connections after 10s by default, which would cut off
 * a request still inside the app's own (longer) timeout. Keep the socket open a
 * little past the request deadline and let the timeout middleware own the 504.
 * The field is in seconds and caps at 255.
 */
const IDLE_TIMEOUT_SECONDS = Math.min(255, Math.ceil(env.REQUEST_TIMEOUT_MS / 1000) + 5)

const server = Bun.serve({
  port: env.PORT,
  idleTimeout: IDLE_TIMEOUT_SECONDS,
  fetch: app.fetch,
})

// `pid` and `hostname` are already in pino's base bindings — don't repeat them.
logger.info({ url: String(server.url), env: env.NODE_ENV }, 'server listening')
