import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'

import type { AppEnv } from '../lib/context.ts'
import { requestDeadline } from './deadline.ts'

function testApp() {
  const app = new Hono<AppEnv>()
  app.use('*', requestDeadline(30))
  app.use('*', bodyLimit({ maxSize: 1024 }))
  app.post('/', async (c) => c.text(await c.req.text()))
  app.onError((error, c) =>
    c.text(error.message, error instanceof HTTPException ? error.status : 500),
  )
  return app
}

describe('request deadline', () => {
  it('covers body buffering in the actual application middleware order', async () => {
    const child = Bun.spawn(
      [
        Bun.argv[0]!,
        '-e',
        `
      import { app } from './src/app.ts'
      let cancelled = false
      const body = new ReadableStream({ cancel() { cancelled = true } })
      const response = await app.request(new Request('http://localhost/not-found', {
        method: 'POST', body,
      }))
      const result = await response.json()
      if (response.status !== 504 || result.error.code !== 'timeout' || !cancelled) {
        throw new Error('upload deadline did not cancel the body and return the timeout envelope')
      }
      `,
      ],
      {
        env: { ...Bun.env, REQUEST_TIMEOUT_MS: '30', LOG_LEVEL: 'silent' },
        timeout: 2000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const errors = await new Response(child.stderr).text()
    expect(await child.exited, errors).toBe(0)
  })

  for (const contentLength of [undefined, '2']) {
    it(`cancels a stalled upload with content-length=${contentLength}`, async () => {
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'))
        },
        cancel() {
          cancelled = true
        },
      })
      const request = new Request('http://localhost/', {
        method: 'POST',
        headers: contentLength ? { 'content-length': contentLength } : {},
        body,
      })
      const response = await testApp().request(request)
      expect(response.status).toBe(504)
      expect(cancelled).toBe(true)
    })
  }

  it('preserves a complete body and its headers', async () => {
    const response = await testApp().request('/', { method: 'POST', body: 'hello' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello')
  })

  it('still rejects oversized uploads', async () => {
    const response = await testApp().request('/', { method: 'POST', body: 'x'.repeat(1025) })
    expect(response.status).toBe(413)
  })
})
