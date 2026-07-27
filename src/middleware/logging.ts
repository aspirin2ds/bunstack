import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../lib/context.ts'
import { logger } from '../lib/logger.ts'

/**
 * Health checks fire every few seconds forever. Logging them at info level
 * drowns real traffic, so they are logged at debug instead — still visible when
 * you are actually debugging a probe.
 */
const QUIET_PATHS = new Set(['/health', '/health/db'])

/**
 * Replaces `hono/logger`. Emits one structured record per completed request and
 * puts a request-scoped child logger on the context, so anything logged during
 * the request carries its `requestId` without having to pass it around.
 */
export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = performance.now()
  const log = logger.child({ requestId: c.get('requestId') })

  c.set('logger', log)

  await next()

  const durationMs = Math.round((performance.now() - start) * 1000) / 1000
  const { status } = c.res

  // 5xx is ours to fix; 4xx is the caller's; everything else is routine.
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  const quiet = QUIET_PATHS.has(c.req.path) && status < 400

  log[quiet ? 'debug' : level](
    {
      req: { method: c.req.method, path: c.req.path },
      res: { status },
      durationMs,
    },
    `${c.req.method} ${c.req.path} ${status}`,
  )
})
