import newrelicFormatter from '@newrelic/winston-enricher'
import winston, { createLogger, format, transports } from 'winston'

// @ts-expect-error asdf
const newrelicWinstonFormatter = newrelicFormatter(winston)

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
    format.printf(({ message, level, timestamp, ...rest }) => {
      return `[${timestamp as string}] ${level}: ${message as string} ${JSON.stringify(rest)}`
    }),
    newrelicWinstonFormatter(),
  ),
  transports: [new transports.Console()],
})
