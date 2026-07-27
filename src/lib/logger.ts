import { pino } from 'pino'

import { env } from '../env.ts'

/**
 * Structured JSON logging to stdout, one object per line.
 *
 * Bun has no built-in structured logger and `console.log` is unstructured, so
 * this is the app's only logging entry point. Deliberately **no pino transport**:
 * transports run a worker thread (`thread-stream`), which buys nothing when the
 * destination is stdout and has a history of friction on Bun. Containers collect
 * stdout, so writing there directly is both simpler and what orchestrators want.
 *
 * For readable local output, pipe through the pino-pretty CLI rather than
 * configuring a transport — `bun run dev` already does.
 */
export const logger = pino({
  level: env.LOG_LEVEL,

  // Defaults are a numeric level and epoch milliseconds. A string label and an
  // ISO timestamp are what log aggregators actually want to index.
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,

  /**
   * Defence in depth. Nothing here logs headers or bodies today, but a censor
   * costs nothing and a leaked `Authorization` header is expensive.
   */
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
      'DATABASE_URL',
    ],
    censor: '[redacted]',
  },
})

export type Logger = typeof logger
