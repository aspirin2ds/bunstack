import { app } from './app.ts'
import { closeDatabase } from './db/index.ts'
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

let shuttingDown = false

async function shutdown(signal: string) {
  // A second Ctrl-C should not start a concurrent shutdown.
  if (shuttingDown) return
  shuttingDown = true

  logger.info({ signal }, 'shutting down')

  try {
    // Waits for in-flight requests, then releases pooled connections.
    await server.stop()
    await closeDatabase()
    logger.info('shutdown complete')
    process.exit(0)
  } catch (err) {
    logger.error({ err }, 'error during shutdown')
    process.exit(1)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal))
}
