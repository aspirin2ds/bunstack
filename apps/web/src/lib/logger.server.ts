import { pino } from 'pino'

import { env } from '../env.server.ts'

/**
 * Structured JSON logging to stdout for the web app's server side, configured
 * exactly like the API's (`apps/api/src/lib/logger.ts`) — same level labels, same
 * ISO timestamps, same no-transport decision, and the same reasoning for each.
 *
 * Keeping them identical is the point: one log pipeline parses both services, and
 * a `service` binding is the only difference so a query can tell them apart.
 *
 * RULES.md LOG-01: never `console.log`. That applies to the web app too.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'web' },

  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,

  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'headers.authorization',
      'headers.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
    ],
    censor: '[redacted]',
  },
})

export type Logger = typeof logger
