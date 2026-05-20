import { createRequire } from 'node:module'
import { createLogger, format, transports } from 'winston'
import Transport from 'winston-transport'

const { combine, printf, errors, json, timestamp } = format

// NR's `-r newrelic` auto-instrumentation of winston only catches require('winston')
// calls made from inside the entry bundle. Under bun, winston imported from a
// pre-built workspace dist (this file, when published as @dotabod/shared-utils)
// isn't seen — so logs from twitch-chat / twitch-events would be silently dropped
// from NR. This transport forwards them explicitly via `newrelic.recordLogEvent()`.
// Gated on NEW_RELIC_LICENSE_KEY so the NR agent is only required when prod env
// signals it's meant to be running (avoids cold-booting NR in unit tests).
const nodeRequire = createRequire(import.meta.url)

class NewRelicTransport extends Transport {
  private nr: { recordLogEvent?: (event: Record<string, unknown>) => void } | null = null

  constructor(opts?: Transport.TransportStreamOptions) {
    super(opts)
    if (!process.env.NEW_RELIC_LICENSE_KEY) return
    try {
      this.nr = nodeRequire('newrelic')
    } catch {
      this.nr = null
    }
  }

  log(info: { message?: unknown; level?: string }, next: () => void): void {
    try {
      this.nr?.recordLogEvent?.({
        ...info,
        message: typeof info.message === 'string' ? info.message : JSON.stringify(info.message),
        level: info.level ?? 'info',
      })
    } catch {
      // forwarding to NR must never break local logging
    }
    next()
  }
}

const isDev = process.env.DOTABOD_ENV === 'development'

const handleErrors = format((info) => {
  if (info instanceof Error) {
    return Object.assign({}, info, { stack: info.stack })
  }
  if (info.e instanceof Error) {
    return Object.assign({}, info, { 'e.stack': info.e.stack })
  }
  if (info.error instanceof Error) {
    return Object.assign({}, info, { 'error.stack': info.error.stack })
  }
  return info
})

const customFormat = printf(({ message, level, timestamp, ...rest }) => {
  return `[${timestamp}] ${level}: ${message}${Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''}`
})

const prodFormats = combine(
  handleErrors(),
  errors({ stack: true }),
  timestamp(),
  json(),
  customFormat,
)

const devFormats = combine(
  handleErrors(),
  errors({ stack: true }),
  json(),
  timestamp(),
  customFormat,
)

export const logger = createLogger({
  format: isDev ? devFormats : prodFormats,
  transports: [new transports.Console(), new NewRelicTransport({ level: 'info' })],
})
