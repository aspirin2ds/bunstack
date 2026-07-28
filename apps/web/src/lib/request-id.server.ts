import { getRequest } from '@tanstack/react-start/server'

/**
 * One request id per inbound browser request, propagated to the API.
 *
 * Both services already log a `requestId`, but they were unrelated numbers: the
 * API's `requestId()` middleware generates a fresh UUID whenever the inbound
 * request carries no `X-Request-Id`, and the web app never sent one. So a slow
 * page and the API call that caused it could not be joined in a log query —
 * exactly when you need it (RULES.md LOG-03).
 *
 * Hono's middleware *does* honour the header when it is present:
 *
 *     let reqId = headerName ? c.req.header(headerName) : undefined
 *     if (!reqId || reqId.length > limitLength || /[^\w\-=]/.test(reqId)) {
 *       reqId = generator(c)
 *     }
 *
 * so sending one is the whole fix. Note the validation: an id the API rejects is
 * silently replaced, which is *worse* than sending nothing — the two services
 * would log different ids while looking correlated. `normalize` below mirrors
 * those bounds so we only ever forward an id the API will keep.
 */
export const REQUEST_ID_HEADER = 'x-request-id'

/** Hono's `requestId()` defaults, mirrored so both ends agree on what is valid. */
const MAX_LENGTH = 255
const INVALID = /[^\w\-=]/

/**
 * Ids keyed by the request object itself, so every call made while handling one
 * request reports the same id, and entries disappear with the request.
 *
 * A `WeakMap` rather than our own `AsyncLocalStorage`: Start already runs the
 * handler inside one, and `getRequest()` is the supported way in. Adding a
 * second store would mean two things to keep in step, and `node:async_hooks`
 * is a Node builtin this template avoids (RULES.md BUN-01).
 */
const ids = new WeakMap<Request, string>()

function normalize(value: string | null): string | undefined {
  if (!value || value.length > MAX_LENGTH || INVALID.test(value)) return undefined
  return value
}

/**
 * The id for `request` — the one an upstream proxy set, or a new one.
 * Stable for the lifetime of the request object.
 */
export function requestIdFor(request: Request): string {
  const existing = ids.get(request)
  if (existing) return existing

  const id = normalize(request.headers.get(REQUEST_ID_HEADER)) ?? crypto.randomUUID()
  ids.set(request, id)

  return id
}

/**
 * The id for the request being handled right now, or `undefined` when there is
 * none — module evaluation, a script, a test.
 *
 * `getRequest()` throws ("No StartEvent found in AsyncLocalStorage") rather than
 * returning undefined off-request, so the guard is a `try`, and the caller sends
 * no header rather than inventing an id nothing else will ever log.
 */
export function currentRequestId(): string | undefined {
  try {
    return requestIdFor(getRequest())
  } catch {
    return undefined
  }
}
