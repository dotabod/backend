import express from 'express'

import { isAuthenticated } from './authUtils.js'
import { chatClient } from '../chatClient.js'
import { Tables } from '../db/supabase-types.js'
import { handleNewUser } from '../handleNewUser.js'
import { InsertPayload, UpdatePayload } from '../types.js'

export const setupWebhooks = () => {
  const webhookApp = express()

  const { NODE_ENV } = process.env

  const IS_DEV = NODE_ENV !== 'production'
  const DEV_CHANNELS = process.env.DEV_CHANNELS?.split(',') ?? []
  const DEV_CHANNELIDS = process.env.DEV_CHANNELIDS?.split(',') ?? []

  // set the expressjs host name
  webhookApp.post('/', express.json(), express.urlencoded({ extended: true }), (req, res) => {
    // check authorization beaerer token
    if (!isAuthenticated(req)) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized',
      })
    }

    if (req.body.type === 'INSERT' && req.body.table === 'accounts') {
      const { body } = req
      const user = body.record as InsertPayload<Tables<'accounts'>>['record']
      if (IS_DEV && !DEV_CHANNELIDS.includes(user.providerAccountId)) return
      if (!IS_DEV && DEV_CHANNELIDS.includes(user.providerAccountId)) return

      handleNewUser(user.providerAccountId)
        .then(() => {
          console.log('[TWITCHEVENTS] done handling new user', {
            providerAccountId: user.providerAccountId,
          })
        })
        .catch((e) => {
          console.log('[TWITCHEVENTS] error on handleNewUser', {
            e,
            providerAccountId: user.providerAccountId,
          })
        })
    } else if (req.body.type === 'UPDATE' && req.body.table === 'accounts') {
      const { body } = req
      const oldUser = body.old_record as UpdatePayload<Tables<'accounts'>>['old_record']
      const newUser = body.record as UpdatePayload<Tables<'accounts'>>['record']

      if (IS_DEV && !DEV_CHANNELIDS.includes(newUser.providerAccountId)) return
      if (!IS_DEV && DEV_CHANNELIDS.includes(newUser.providerAccountId)) return

      // couldn't inline these two variables because of
      // typescript thinking they're strings in an if statement
      const newreq = newUser.requires_refresh
      const oldreq = oldUser.requires_refresh

      if (oldreq !== newreq && newreq !== true) {
        console.log('[SUPABASE] Refresh token changed, updating chat client', {
          providerAccountId: newUser.providerAccountId,
        })

        handleNewUser(newUser.providerAccountId)
          .then(() => {
            console.log('[TWITCHEVENTS] done handling new user', {
              providerAccountId: newUser.providerAccountId,
            })
          })
          .catch((e) => {
            console.log('[TWITCHEVENTS] error on handleNewUser', {
              e,
              providerAccountId: newUser.providerAccountId,
            })
          })
      }
    } else if (req.body.type === 'UPDATE' && req.body.table === 'users') {
      const { body } = req
      const oldUser = body.old_record as UpdatePayload<Tables<'users'>>['old_record']
      const newUser = body.record as UpdatePayload<Tables<'users'>>['record']

      if (IS_DEV && !DEV_CHANNELS.includes(newUser.name)) return
      if (!IS_DEV && DEV_CHANNELS.includes(newUser.name)) return

      if (!oldUser.displayName && newUser.displayName) {
        console.log('[SUPABASE] New user to send bot to: ', newUser.name)
        chatClient.join(newUser.name)
      } else if (oldUser.name !== newUser.name) {
        console.log('[SUPABASE] User changed name: ', {
          oldName: oldUser.name,
          newName: newUser.name,
        })
        chatClient.part(oldUser.name)
        chatClient.join(newUser.name)
      }
    }

    res.status(200).json({
      status: 'ok',
    })
  })

  webhookApp.listen(5011, () => {
    console.log('[TWITCHEVENTS] Webhooks Listening on port 5011')
  })
}
