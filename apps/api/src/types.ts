/**
 * The API's public *type* surface, and the only entry point other workspaces
 * may import (`@repo/api/types`).
 *
 * RULES.md WS-01/WS-05: no app imports another app's runtime code. Everything
 * re-exported here is `export type`, so `verbatimModuleSyntax` erases it and the
 * built module is empty — importing it at runtime pulls in no Hono, no Drizzle
 * and no database pool, even by accident.
 *
 * `packages/api-client` turns `AppType` into a typed `hc` client; the web app
 * consumes that, never this file directly.
 */
export type { AppType } from './app.ts'
