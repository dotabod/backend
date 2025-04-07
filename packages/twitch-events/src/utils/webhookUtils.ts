import { botStatus, logger } from '@dotabod/shared-utils'
import express from 'express'
import bodyParserErrorHandler from 'express-body-parser-error-handler'
import type { Tables } from '../db/supabase-types.js'
import supabase from '../db/supabase.js'
import { handleNewUser } from '../handleNewUser.js'
import { isAuthenticated } from './authUtils.js'

if (!process.env.TWITCH_CLIENT_ID) {
  throw new Error('TWITCH_CLIENT_ID is not defined')
}

type InsertPayload<T> = {
  type: 'INSERT'
  table: string
  schema: string
  record: T
  old_record: null
}

type UpdatePayload<T> = {
  type: 'UPDATE'
  table: string
  schema: string
  record: T
  old_record: T
}

export const setupWebhooks = () => {
  const webhookApp = express()

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
      // check authorization bearer token
      if (!isAuthenticated(req)) {
        logger.info('[TWITCHEVENTS] Unauthorized request', {
          headers: req.headers,
          body: req.body,
          ip: req.ip,
        })

        res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        })
        return
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
          if (newUser.providerAccountId === process.env.TWITCH_BOT_PROVIDERID) {
            logger.info('Bot no longer banned, updating status')
            botStatus.isBanned = false
          }

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

  webhookApp.listen(5011, () => {
    logger.info('[TWITCHEVENTS] Webhook server listening on port 5011')
  })
}
