import newrelicFormatter from '@newrelic/winston-enricher'
import winston, { createLogger, format, transports } from 'winston'
const isDev = process.env.NODE_ENV === 'development'
// @ts-expect-error asdf
const newrelicWinstonFormatter = newrelicFormatter(winston)

const prodFormats = format.combine(format.errors({ stack: true }), newrelicWinstonFormatter())
const devFormats = format.combine(
  format.errors({ stack: true }),
  format.json(),
  format.printf(({ message, level, timestamp, ...rest }) => {
    return `[${timestamp as string}] ${level}: ${message as string} ${JSON.stringify(rest)}`
  }),
)

export const logger = createLogger({
  format: !isDev ? prodFormats : devFormats,
  transports: [new transports.Console()],
})
