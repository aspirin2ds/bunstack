import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import { requestId } from 'hono/request-id'

import type { AppEnv } from '../lib/context.ts'

type Record_ = { level: string; obj: Record<string, unknown>; msg?: string }

const records: Record_[] = []

/** Minimal stand-in for a pino logger that records what it was asked to write. */
function fakeLogger() {
  const write = (level: string) => (obj: Record<string, unknown>, msg?: string) => {
    records.push({ level, obj, msg })
  }

  const instance = {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (bindings: Record<string, unknown>) => ({
      ...instance,
      debug: (o: Record<string, unknown>, m?: string) =>
        records.push({ level: 'debug', obj: { ...bindings, ...o }, msg: m }),
      info: (o: Record<string, unknown>, m?: string) =>
        records.push({ level: 'info', obj: { ...bindings, ...o }, msg: m }),
      warn: (o: Record<string, unknown>, m?: string) =>
        records.push({ level: 'warn', obj: { ...bindings, ...o }, msg: m }),
      error: (o: Record<string, unknown>, m?: string) =>
        records.push({ level: 'error', obj: { ...bindings, ...o }, msg: m }),
    }),
  }

  return instance
}

mock.module('../lib/logger.ts', () => ({ logger: fakeLogger() }))

const { requestLogger } = await import('./logging.ts')

const app = new Hono<AppEnv>()
app.use('*', requestId())
app.use('*', requestLogger)
app.get('/ok', (c) => c.text('ok'))
app.get('/health', (c) => c.text('ok'))
app.get('/bad', (c) => c.text('nope', 400))
app.get('/boom', () => {
  throw new Error('kaboom')
})
// Mirrors the real app, which always has an error handler.
app.onError((_err, c) => c.text('internal', 500))

beforeEach(() => {
  records.length = 0
})

describe('requestLogger', () => {
  it('emits one record per request with the request context', async () => {
    await app.request('/ok')

    expect(records).toHaveLength(1)

    const [entry] = records
    expect(entry?.level).toBe('info')
    expect(entry?.obj).toMatchObject({
      req: { method: 'GET', path: '/ok' },
      res: { status: 200 },
    })
    expect(entry?.obj.requestId).toBeString()
    expect(entry?.obj.durationMs).toBeNumber()
  })

  it('logs 4xx at warn, since it is the caller who erred', async () => {
    await app.request('/bad')

    expect(records[0]?.level).toBe('warn')
  })

  it('demotes successful health checks to debug so probes do not drown traffic', async () => {
    await app.request('/health')

    expect(records[0]?.level).toBe('debug')
  })

  it('still records the request when the handler throws', async () => {
    await app.request('/boom')

    // Hono's compose routes the throw through `onError` before `next()`
    // settles, so the middleware still sees a finished response. That is
    // internal behaviour, hence this guard: if it ever changes, 5xx requests
    // would silently stop being logged — exactly the ones worth having.
    expect(records).toHaveLength(1)
    expect(records[0]?.level).toBe('error')
    expect(records[0]?.obj).toMatchObject({ res: { status: 500 } })
  })
})
