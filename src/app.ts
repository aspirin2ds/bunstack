import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId, type RequestIdVariables } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { timeout } from 'hono/timeout'

import { checkDatabase } from './db/index.ts'
import { env, isProduction } from './env.ts'
import { AppError, toErrorBody, type ErrorCode } from './lib/errors.ts'
import { usersRoutes } from './routes/users.ts'

type AppEnv = { Variables: RequestIdVariables }

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  504: 'timeout',
}

export const app = new Hono<AppEnv>()

app.use('*', requestId())
app.use('*', logger())

// Sensible security defaults (CSP, nosniff, frame-deny, referrer policy).
app.use('*', secureHeaders())

// Only advertise cross-origin access when origins are configured explicitly.
if (env.CORS_ORIGINS.length > 0) {
  app.use('*', cors({ origin: env.CORS_ORIGINS, credentials: true }))
}

// Reject oversized bodies before they are buffered or parsed.
app.use(
  '*',
  bodyLimit({
    maxSize: env.BODY_LIMIT_BYTES,
    onError: () => {
      throw new AppError('payload_too_large', 'Request body too large')
    },
  }),
)

// Bound every request so a stuck query cannot hold a connection forever.
app.use('*', timeout(env.REQUEST_TIMEOUT_MS))

app.get('/health', (c) => c.json({ status: 'ok' }))

// Separate from `/health` so an orchestrator can distinguish "process is up"
// from "process can reach its database".
app.get('/health/db', async (c) => {
  const ok = await checkDatabase()
  return c.json({ status: ok ? 'ok' : 'unavailable', database: ok }, ok ? 200 : 503)
})

export const routes = app.route('/api/users', usersRoutes)

/** Type for Hono's `hc` RPC client: `hc<AppType>('/')`. */
export type AppType = typeof routes

app.notFound((c) =>
  c.json(
    toErrorBody(
      AppError.notFound(`No route for ${c.req.method} ${c.req.path}`),
      c.get('requestId'),
    ),
    404,
  ),
)

app.onError((err, c) => {
  const requestId = c.get('requestId')

  if (err instanceof AppError) {
    return c.json(toErrorBody(err, requestId), err.status)
  }

  if (err instanceof HTTPException) {
    const code = CODE_BY_STATUS[err.status] ?? 'internal'
    return c.json(toErrorBody(new AppError(code, err.message), requestId), err.status)
  }

  console.error(`[${requestId}] unhandled error`, err)

  // Never leak an unexpected error's message to clients in production.
  return c.json(
    toErrorBody(
      new AppError('internal', isProduction ? 'Internal server error' : String(err)),
      requestId,
    ),
    500,
  )
})
