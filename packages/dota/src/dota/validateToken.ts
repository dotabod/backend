import type { NextFunction, Request, Response } from 'express'

import getDBUser from '../db/getDBUser.js'
import { logger } from '../utils/logger.js'
import { invalidTokens, lookingupToken, pendingCheckAuth } from './lib/consts.js'

export function validateToken(req: Request, res: Response, next: NextFunction) {
  const forwardedIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress

  // Sent from dota gsi config file
  const token = req.body?.auth?.token as string | undefined

  if (invalidTokens.has(token)) {
    res.status(200).json({
      error: 'Invalid token, skipping auth check',
    })
    return
  }

  if (!token) {
    logger.info('[GSI], Dropping message, no valid auth token', { forwardedIp })
    res.status(200).json({
      error: 'Invalid request! No token provided.',
    })
    return
  }

  // lookingupToken comes from the gsi handler, which could be true at the same time
  // so getDBUser was returning null, which means this was sending a new auth error and then
  // no longer doing authentications. i think adding the `lookingupToken` check here fixes that
  if (pendingCheckAuth.has(token) || lookingupToken.has(token)) {
    res.status(200).json({
      error: 'Still validating token, skipping requests until auth',
    })
    return
  }

  pendingCheckAuth.set(token, true)
  getDBUser({ token, ip: forwardedIp })
    .then((client) => {
      if (client?.token) {
        if (!client.stream_online) {
          pendingCheckAuth.delete(token)
          res.status(200).json({
            error: 'Stream offline',
          })
          return
        }

        client.gsi = req.body
        pendingCheckAuth.delete(token)

        next()
        return
      }

      pendingCheckAuth.delete(token)
      logger.info('[GSI] io.use Error checking auth 42', { token, client })
      res.status(200).json({ error: 'Invalid token, skipping auth check' })
    })
    .catch((e) => {
      logger.info('[GSI] io.use Error checking auth 48', { token, e })
      invalidTokens.add(token)
      pendingCheckAuth.delete(token)
      res.status(200).json({
        error: 'Invalid token, skipping auth check',
      })
    })
    // TODO: idk if finally runs when next() is called in a .then() earlier
    // So adding the .deletes to .then and .catch until i figure that out lol
    .finally(() => {
      pendingCheckAuth.delete(token)
    })
}
