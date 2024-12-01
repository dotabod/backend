import express from 'express'
import bodyParserErrorHandler from 'express-body-parser-error-handler'

import { SubscribeEvents } from '../SubscribeEvents.js'
import { chatClient } from '../chatClient.js'
import type { Tables } from '../db/supabase-types.js'
import supabase from '../db/supabase.js'
import { handleNewUser } from '../handleNewUser.js'
import { listener } from '../listener.js'
import { getAccountIds } from '../twitch/lib/getAccountIds.js'
import { logger } from '../twitch/lib/logger.js'
import { revokeEvent } from '../twitch/lib/revokeEvent.js'
import type { InsertPayload, UpdatePayload } from '../types.js'
import { isAuthenticated } from './authUtils.js'

export const setupWebhooks = () => {
  const webhookApp = express()

  const IS_DEV = process.env.DOTABOD_ENV !== 'production'

  webhookApp.use(bodyParserErrorHandler())

  webhookApp.get('/webhook', (req, res) => {
    res.status(200).json({
      status: 'ok',
    })
  })

  webhookApp.post(
    '/webhook',
    express.json(),
    express.urlencoded({ extended: true }),
    async (req, res) => {
      // check authorization beaerer token
      if (!isAuthenticated(req)) {
        logger.info('[TWITCHEVENTS] Unauthorized request', {
          headers: req.headers,
          body: req.body,
          ip: req.ip,
        })

        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        })
      }

      if (req.body.type === 'INSERT' && req.body.table === 'accounts') {
        const { body } = req
        const user = body.record as InsertPayload<Tables<'accounts'>>['record']
        handleNewUser(user.providerAccountId)
          .then(() => {
            logger.info('[TWITCHEVENTS] INSERT done handling new user', {
              providerAccountId: user.providerAccountId,
            })
          })
          .catch((e) => {
            logger.info('[TWITCHEVENTS] INSERT error on handleNewUser', {
              e,
              providerAccountId: user.providerAccountId,
            })
          })
      } else if (req.body.type === 'UPDATE' && req.body.table === 'accounts') {
        logger.info('[TWITCHEVENTS] UPDATE accounts', { body: req.body })
        const { body } = req
        const oldUser = body.old_record as UpdatePayload<Tables<'accounts'>>['old_record']
        const newUser = body.record as UpdatePayload<Tables<'accounts'>>['record']

        // couldn't inline these two variables because of
        // typescript thinking they're strings in an if statement
        const newreq = newUser.requires_refresh
        const oldreq = oldUser.requires_refresh

        // when the old refresh_token value is true, and the new one is false
        // we need to re-subscribe to events
        if (oldreq === true && newreq === false) {
          logger.info('[SUPABASE] Refresh token changed, updating events client', {
            providerAccountId: newUser.providerAccountId,
          })

          handleNewUser(newUser.providerAccountId)
            .then(() => {
              logger.info('[TWITCHEVENTS] UPDATE done handling new user', {
                providerAccountId: newUser.providerAccountId,
              })
            })
            .catch((e) => {
              logger.info('[TWITCHEVENTS] UPDATE error on handleNewUser', {
                e,
                providerAccountId: newUser.providerAccountId,
              })
            })
        }
      } else if (req.body.type === 'UPDATE' && req.body.table === 'users') {
        const { body } = req
        const oldUser = body.old_record as UpdatePayload<Tables<'users'>>['old_record']
        const newUser = body.record as UpdatePayload<Tables<'users'>>['record']

        if (oldUser.name !== newUser.name || oldUser.displayName !== newUser.displayName) {
          logger.info('[SUPABASE] User changed name: ', {
            oldName: oldUser.name,
            newName: newUser.name,
            oldDisplayName: oldUser.displayName,
            newDisplayName: newUser.displayName,
          })

          const { data: account } = await supabase
            .from('accounts')
            .select('providerAccountId')
            .eq('userId', newUser.id)
            .single()

          if (account?.providerAccountId) {
            chatClient.part(oldUser.name)

            try {
              // This updates their actual twitch username via twitch api
              // Only resubscribing if it's a new user
              await handleNewUser(account.providerAccountId, !oldUser.displayName)
            } catch (e) {
              logger.info('[TWITCHEVENTS] error on handleNewUser 3', {
                e,
                providerAccountId: account.providerAccountId,
              })
            }
          }
        }
      }

      res.status(200).json({
        status: 'ok',
      })
    },
  )

  // Why can't i use async on express listen?
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  webhookApp.listen(5011, async () => {
    logger.info('[TWITCHEVENTS] Webhooks Listening on port 5011')

    listener.start()

    logger.info('READY!')
    try {
      listener.onUserAuthorizationRevoke(process.env.TWITCH_CLIENT_ID ?? '', revokeEvent)
    } catch (e) {
      logger.info('[TWITCHEVENTS] error on listener.onUserAuthorizationRevoke', { e })
    }

    const accountIds = await getAccountIds()
    SubscribeEvents(accountIds)
  })
}
