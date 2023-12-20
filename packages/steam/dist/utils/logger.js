import { createLogger, format, transports } from 'winston';
const { combine, printf, errors, json, timestamp } = format;
const isDev = process.env.NODE_ENV === 'development';
const handleErrors = format((info) => {
    if (info instanceof Error) {
        return Object.assign({}, info, { stack: info.stack });
    }
    if (info.e instanceof Error) {
        return Object.assign({}, info, { 'e.stack': info.e.stack });
    }
    return info;
});
const prodFormats = combine(handleErrors(), errors({ stack: true }), json());
const devFormats = combine(handleErrors(), errors({ stack: true }), json(), timestamp(), printf(({ message, level, timestamp, ...rest }) => {
    return `[${timestamp}] ${level}: ${message} ${JSON.stringify(rest, null, 2)}`;
}));
export const logger = createLogger({
    format: isDev ? devFormats : prodFormats,
    transports: [new transports.Console()],
});
//# sourceMappingURL=logger.js.map