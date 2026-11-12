import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { timeout } from 'hono/timeout'

import type { AppEnv } from '../lib/context.ts'

/** Includes body reads in the deadline and cancels an unfinished upload. */
export function requestDeadline(duration: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const error = new HTTPException(504, { message: 'Gateway Timeout' })
    const body = c.req.raw.body
    let cancelBody: (() => void) | undefined

    if (body) {
      const reader = body.getReader()
      let finished = false
      const wrapped = new ReadableStream<Uint8Array>({
        start(controller) {
          cancelBody = () => {
            if (finished) return
            finished = true
            controller.error(error)
            // The deadline response must not wait for the sender to acknowledge cancellation.
            void reader.cancel(error).catch(() => {})
          }
        },
        async pull(controller) {
          try {
            const chunk = await reader.read()
            if (finished) return
            if (chunk.done) {
              finished = true
              reader.releaseLock()
              controller.close()
            } else {
              controller.enqueue(chunk.value)
            }
          } catch (error) {
            if (!finished) {
              finished = true
              controller.error(error)
            }
          }
        },
        async cancel(reason) {
          finished = true
          await reader.cancel(reason)
        },
      })
      c.req.raw = new Request(c.req.raw, { body: wrapped })
    }

    await timeout(duration, () => {
      cancelBody?.()
      return error
    })(c, next)
  }
}
