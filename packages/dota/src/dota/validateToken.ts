import { FastifyReply } from 'fastify'

import getDBUser from '../db/getDBUser.js'
import { logger } from '../utils/logger.js'
import { invalidTokens, lookingupToken, pendingCheckAuth } from './lib/consts.js'

export const validateToken = async (req: any, res: FastifyReply, done: any) => {
  const token = req.body?.auth?.token as string | undefined

  if (invalidTokens.has(token)) {
    res.status(401).send('Invalid token, skipping auth check')
    return
  }

  if (!token) {
    invalidTokens.add(token)
    logger.info(`[GSI], Dropping messag no valid auth token`)
    res.status(401).send({
      error: new Error('Invalid request!'),
    })
    return
  }

  // lookingupToken comes from the gsi handler, which could be true at the same time
  // so getDBUser was returning null, which means this was sending a new auth error and then
  // no longer doing authentications. i think adding the `lookingupToken` check here fixes that
  if (pendingCheckAuth.has(token) || lookingupToken.has(token)) {
    res.status(401).send('Still validating token, skipping requests until auth')
    return
  }

  pendingCheckAuth.set(token, true)
  try {
    const client = await getDBUser(token)
    if (client?.token) {
      client.gsi = req.body
      pendingCheckAuth.delete(token)

      done()
      return
    }

    pendingCheckAuth.delete(token)
    logger.info('[GSI] io.use Error checking auth 42', { token, client })
    res.status(401).send({
      error: new Error('Invalid request 42!'),
    })
  } catch (e) {
    logger.info('[GSI] io.use Error checking auth 48', { token, e })
    invalidTokens.add(token)
    pendingCheckAuth.delete(token)
    res.status(401).send({
      error: new Error('Invalid request 48!'),
    })
  } finally {
    pendingCheckAuth.delete(token)
  }
}
