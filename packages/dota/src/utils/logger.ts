import { createLogger, format, transports } from 'winston'
const isDev = process.env.NODE_ENV === 'development'

const prodFormats = format.combine(format.errors({ stack: true }), format.json())
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
