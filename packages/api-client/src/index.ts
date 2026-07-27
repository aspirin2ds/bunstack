// RULES.md WS-05: a type-only import. `@repo/api/types` re-exports nothing but
// types, so no Hono instance, Drizzle query builder or database pool crosses
// into this package — or into the web app that depends on it.
import type { AppType } from '@repo/api/types'
import type { ClientRequestOptions } from 'hono/client'
import { hc } from 'hono/client'

/**
 * Typed client for the API, inferred from the API's own route definitions.
 *
 * The inference only works because the API chains its `.openapi()` calls into a
 * single expression (see `apps/api/src/routes/users.ts`); declaring handlers
 * separately would leave `AppType` without the route information and every call
 * here would degrade to `any`.
 */
export type ApiClient = ReturnType<typeof createApiClient>

/**
 * A plain `fetch`-shaped function.
 *
 * Deliberately *not* `typeof fetch`: Bun's global carries extra properties
 * (`preconnect`), so an ordinary arrow function is not assignable to it, and
 * Hono's own option is the union `typeof fetch | HonoRequest`, which suppresses
 * contextual typing of the parameters. Naming the call signature here means a
 * caller can write `(input, init) => ...` and have both parameters inferred.
 */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface ApiClientOptions {
  /** Base URL of the API, e.g. `http://api:3000`. No trailing slash needed. */
  baseUrl: string
  /** Override for tests, or to attach a timeout/tracing wrapper on the server. */
  fetch?: FetchLike
  headers?: Record<string, string>
}

export function createApiClient({ baseUrl, fetch: fetchImpl, headers }: ApiClientOptions) {
  return hc<AppType>(baseUrl, {
    // The one cast in this package: `FetchLike` is structurally what `hc` calls,
    // but it is not assignable to Hono's wider `typeof fetch | HonoRequest`.
    // Kept here so no consumer has to know that.
    ...(fetchImpl ? { fetch: fetchImpl as ClientRequestOptions['fetch'] } : {}),
    ...(headers ? { headers } : {}),
  })
}

/** The API's error envelope. Mirrors `toErrorBody` in `apps/api/src/lib/errors.ts`. */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: Array<{ path: string; message: string }>
    requestId?: string
  }
}

/**
 * A failed API call, carrying the envelope's fields so a caller can branch on
 * `code` rather than parsing messages.
 *
 * `requestId` is the reason this exists: it ties a failure in the browser to the
 * API log line that produced it (RULES.md LOG-03).
 */
export class ApiError extends Error {
  override readonly name = 'ApiError'

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
    readonly requestId?: string,
  ) {
    super(message)
  }

  /** True when the API said the request itself was wrong, not the server. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

/**
 * Structural shape of an `hc` response. Declared here rather than imported from
 * Hono so `unwrap` also accepts a hand-built response in tests — exported for
 * exactly that purpose.
 */
export interface JsonResponse<T> {
  ok: boolean
  status: number
  json(): Promise<T>
}

/**
 * Unwraps the `{ data }` envelope, or throws `ApiError`.
 *
 * Every route either answers `{ data }` or the error envelope, so this is the
 * single place that knows the convention — a caller gets the payload or an
 * exception, and never has to check `response.ok` itself.
 */
export async function unwrap<T>(response: JsonResponse<{ data: T } | ApiErrorBody>): Promise<T> {
  if (!response.ok) {
    throw await toApiError(response)
  }

  const body = (await response.json()) as { data: T }
  return body.data
}

/**
 * Like `unwrap`, for the 204 routes that answer with no body at all.
 * Calling `.json()` on those would throw a parse error, masking the real result.
 *
 * The body type is `unknown` because a 204 arm of an `hc` response union carries
 * no JSON type at all; only the failure path reads the body, and `toApiError`
 * tolerates a body that is missing or unparseable.
 */
export async function unwrapEmpty(response: JsonResponse<unknown>): Promise<void> {
  if (!response.ok) {
    throw await toApiError(response)
  }
}

async function toApiError(response: JsonResponse<unknown>): Promise<ApiError> {
  let body: ApiErrorBody | undefined

  // A gateway or proxy failure will not be carrying our envelope, so a parse
  // failure here must not replace the real status with a JSON syntax error.
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    body = undefined
  }

  const error = body?.error

  return new ApiError(
    response.status,
    error?.code ?? 'internal',
    error?.message ?? `Request failed with status ${response.status}`,
    error?.details,
    error?.requestId,
  )
}
