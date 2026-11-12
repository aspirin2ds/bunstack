#!/usr/bin/env bun
/** Verify production SSR pagination and liveness without a real database. Build first. */
const users = Array.from({ length: 21 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: `Person-${String(index).padStart(3, '0')}`,
  email: `user${index}@example.com`,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}))
const api = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    const query = new URL(request.url).searchParams
    const offset = Number(query.get('offset') ?? 0)
    const limit = Number(query.get('limit') ?? 20)
    return Response.json({ data: users.slice(offset, offset + limit) })
  },
})
// Reserve an available port, then hand it to the production web process.
const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
const port = reservation.port
await reservation.stop(true)
const url = `http://127.0.0.1:${port}`
const child = Bun.spawn(['bun', 'server.ts'], {
  cwd: 'apps/web',
  env: {
    ...Bun.env,
    NODE_ENV: 'production',
    PORT: String(port),
    API_URL: String(api.url),
    LOG_LEVEL: 'silent',
  },
  stdout: 'ignore',
  stderr: 'inherit',
})

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(`${url}/health`)).ok
      if (ready) break
    } catch {
      /* The server is still booting. */
    }
    await Bun.sleep(25)
  }
  assert(ready, 'web server did not start')
  const first = await fetch(`${url}/users?page=1`)
  const firstHtml = await first.text()
  assert(
    first.ok && firstHtml.includes('Person-000') && firstHtml.includes('Person-019'),
    'first page missing users',
  )
  assert(!firstHtml.includes('Person-020'), 'first page exceeds its page size')
  assert(firstHtml.includes('page=2'), 'Next must link to page 2')
  const second = await fetch(`${url}/users?page=2`)
  const secondHtml = await second.text()
  assert(second.ok && secondHtml.includes('Person-020'), 'user 21 is not reachable on page 2')
  assert(!secondHtml.includes('Person-000'), 'second page repeats the first page')
  assert(secondHtml.includes('page=1'), 'Previous must link to page 1')
  await api.stop(true)
  assert((await fetch(`${url}/health`)).ok, 'web liveness depends on the API')
  console.log('Production web pagination and liveness checks passed')
} finally {
  child.kill()
  await child.exited
  await api.stop(true)
}
