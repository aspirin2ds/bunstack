import { env } from './src/env.server.ts'
import { logger } from './src/lib/logger.server.ts'

/**
 * Production server for the built app.
 *
 * `vite build` emits a client bundle to `dist/client` and a fetch-style handler to
 * `dist/server/server.js`; nothing in the output serves the static files, so a
 * server has to. TanStack publishes a ~550-line reference implementation with
 * asset preloading and compression knobs — this is the simplified version their
 * docs invite you to write, adapted to this template's rules: env through
 * `env.server.ts` (CFG-01), pino instead of `console.log` (LOG-01), and a drained
 * shutdown (OPS-06).
 *
 * Reach for the upstream version if you are serving large assets from this process
 * rather than from a CDN.
 */
/**
 * A directory URL, not a string path — the trailing slash matters, because URL
 * resolution treats a path without one as a file and drops the last segment.
 * Using URLs keeps this file free of `node:path` (RULES.md BUN-01).
 */
const CLIENT_DIR = new URL('dist/client/', import.meta.url)
const SERVER_ENTRY = './dist/server/server.js'

interface StartHandler {
  fetch: (request: Request) => Response | Promise<Response>
}

const { default: handler } = (await import(SERVER_ENTRY)) as {
  default: StartHandler
}

/**
 * Start's handler is built on srvx, and on some paths — its own error responses in
 * particular — it hands back an srvx `NodeResponse` wrapper rather than a native
 * `Response`. `Bun.serve` rejects that with "Expected a Response object", so an
 * SSR error would reach the browser as a dropped connection instead of a 500 page.
 *
 * The wrapper exposes the real thing on `_response`. This was observed on Bun
 * 1.3.9 with @tanstack/react-start 1.168 — verify before removing it.
 */
function toNativeResponse(response: Response): Response {
  if (response instanceof Response) return response

  const unwrapped = (response as { _response?: Response })._response

  if (unwrapped instanceof Response) return unwrapped

  throw new TypeError('Start handler returned a value that is not a Response')
}

/**
 * Vite fingerprints everything under `/assets/`, so those may be cached forever.
 * Anything else in `dist/client` keeps its name across deploys and must not be.
 */
function cacheControl(pathname: string): string {
  return pathname.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0, must-revalidate'
}

/**
 * Resolves a request path to a file URL inside `dist/client`, or undefined.
 *
 * The containment check is the security-relevant part (RULES.md SEC-05).
 * WHATWG URL resolution collapses `..` segments per RFC 3986 before we compare,
 * so `/../../etc/passwd` resolves above `CLIENT_DIR`, fails the prefix test and
 * is refused. Doing it with `URL` rather than `path.normalize` also means the
 * check runs on exactly the string `Bun.file` will open — no second
 * normalization step that could disagree with the first.
 */
function resolveAsset(pathname: string): URL | undefined {
  let candidate: URL

  try {
    // Leading `.` makes it relative to CLIENT_DIR rather than the URL root.
    candidate = new URL(`.${decodeURIComponent(pathname)}`, CLIENT_DIR)
  } catch {
    // Malformed percent-encoding. Not an asset; let the app handle the request.
    return undefined
  }

  if (!candidate.href.startsWith(CLIENT_DIR.href)) return undefined

  return candidate
}

const server = Bun.serve({
  port: env.PORT,

  async fetch(request) {
    const { pathname } = new URL(request.url)

    // Static assets first, because nothing else serves them: the build output
    // contains the files but no file server, and Start's handler 404s them. A
    // miss here falls through, so Start still owns real 404s and the SPA routes.
    if (request.method === 'GET' || request.method === 'HEAD') {
      const asset = resolveAsset(pathname)

      if (asset) {
        const file = Bun.file(asset)

        if (await file.exists()) {
          return new Response(file, {
            headers: { 'cache-control': cacheControl(pathname) },
          })
        }
      }
    }

    try {
      return toNativeResponse(await handler.fetch(request))
    } catch (err) {
      logger.error({ err, method: request.method, path: pathname }, 'unhandled request error')
      return new Response('Internal Server Error', { status: 500 })
    }
  },
})

logger.info({ url: String(server.url), env: env.NODE_ENV, apiUrl: env.API_URL }, 'server listening')
