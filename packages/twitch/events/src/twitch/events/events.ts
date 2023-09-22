// Self clearing set to try to solve this race condition from twitch:
// https://github.com/dotabod/backend/issues/250
export const onlineEvents = new Map<string, Date>()
