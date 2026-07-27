import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

/**
 * TanStack Start calls this to build a router per request on the server, and once
 * on the client. It must be a factory, not a shared instance — a module-level
 * router would leak one request's loader data into the next.
 */
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })
}
