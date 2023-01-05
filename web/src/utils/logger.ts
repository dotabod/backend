import newrelicFormatter from '@newrelic/winston-enricher'
import winston, { createLogger, format, transports } from 'winston'

// @ts-expect-error asdf
const newrelicWinstonFormatter = newrelicFormatter(winston)

export const logger = createLogger({
  format: format.combine(format.errors({ stack: true }), newrelicWinstonFormatter()),
  transports: [new transports.Console()],
})
