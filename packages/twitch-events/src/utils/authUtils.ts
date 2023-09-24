import { Request } from 'express'

export const isAuthenticated = (req: Request): boolean => {
  return req.headers.authorization === process.env.TWITCH_EVENTSUB_SECRET
}
