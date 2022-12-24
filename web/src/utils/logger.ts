import winston from 'winston'

const { combine, errors, simple, timestamp } = winston.format
export const logger = winston.createLogger({
  level: 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    simple(),
  ),
  transports: [new winston.transports.Console()],
})
