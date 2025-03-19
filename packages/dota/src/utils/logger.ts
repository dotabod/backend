import { createLogger, format, transports } from 'winston'
const { combine, printf, errors, json, timestamp } = format

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
  transports: [new transports.Console()],
})
