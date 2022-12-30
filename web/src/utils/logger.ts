import { createLogger, format, transports } from 'winston'

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
  ),
  transports: [new transports.Console()],
})
