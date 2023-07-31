import { Account } from '@dotabod/prisma/dist/psql/index'
import { EventSubMiddleware } from '@twurple/eventsub-http'
import { Request, Response } from 'express'

import { prisma } from './db/prisma.js'
import { events } from './twitch/events/events.js'
import { handleEvent } from './twitch/events/handleEvent.js'
import BotAPI from './twitch/lib/BotApiSingleton.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'

const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_CHANNELIDS = process.env.DEV_CHANNELIDS?.split(',') ?? []
const botApi = BotAPI.getInstance()

const SubscribeEvents = (accountIds: string[]) => {
  const promises: Promise<any>[] = []
  accountIds.forEach((userId) => {
    try {
      promises.push(
        ...Object.keys(events).map((eventName) => {
          const eventNameTyped = eventName as keyof typeof events
          try {
            // @ts-expect-error asdf
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return middleware[eventName](userId, (data: unknown) =>
              handleEvent(eventNameTyped, data),
            )
          } catch (error) {
            console.log('[TWITCHEVENTS] Could not sub userId error', { userId, error })
          }
        }),
      )
    } catch (e) {
      console.log(e)
    }
  })

  console.log('[TWITCHEVENTS] Starting promise waiting for', accountIds.length)
  Promise.all(promises)
    .then(() =>
      console.log('[TWITCHEVENTS] done subbing to channelLength:', {
        channelLength: accountIds.length,
      }),
    )
    .catch((e) => {
      console.log('[TWITCHEVENTS] Could not sub due to error', { error: e })
    })
}

const middleware = new EventSubMiddleware({
  apiClient: botApi,
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  hostName: process.env.EVENTSUB_HOST!,
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  secret: process.env.TWITCH_EVENTSUB_SECRET!,
  legacySecrets: true,
})

// create an expressjs app
const express = (await import('express')).default
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

middleware.apply(app)

app.post('/webhooks', (req: Request, res: Response) => {
  // check authorization beaerer token
  if (req.headers.authorization !== process.env.TWITCH_EVENTSUB_SECRET) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized',
    })
  }

  if (req.body.type === 'INSERT' && req.body.table === 'accounts') {
    const user = req.body.record as Account
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
  }

  res.status(200).json({
    status: 'ok',
  })
})

app.listen(5010, () => {
  middleware
    .markAsReady()
    .then(() => {
      console.log('[TWITCHEVENTS] Middleware is ready')
    })
    .catch((e) => {
      console.log('[TWITCHEVENTS] Failed to mark middleware as ready:', { e })
    })

  console.log("Let's get started")

  // Load every account id when booting server
  getAccountIds()
    .then((accountIds) => {
      console.log('[TWITCHEVENTS] Retrieved accountIds', { length: accountIds.length })

      SubscribeEvents(accountIds)
    })
    .catch((e) => {
      console.log('[TWITCHEVENTS] error getting accountIds', { e })
    })
})

async function handleNewUser(providerAccountId: string) {
  console.log("[TWITCHEVENTS] New user, let's get their info", { userId: providerAccountId })

  if (!providerAccountId) {
    console.log("[TWITCHEVENTS] This should never happen, user doesn't have a providerAccountId", {
      providerAccountId,
    })
    return
  }

  try {
    const stream = await botApi.streams.getStreamByUserId(providerAccountId)
    const streamer = await botApi.users.getUserById(providerAccountId)
    const follows = botApi.users.getFollowsPaginated({
      followedUser: providerAccountId,
    })
    const totalFollowerCount = await follows.getTotalCount()

    const data = {
      displayName: streamer?.displayName,
      name: streamer?.name,
      followers: totalFollowerCount,
      stream_online: !!stream?.startDate,
      stream_start_date: stream?.startDate ?? null,
    }

    // remove falsy values from data (like displayName: undefined)
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => Boolean(value)),
    )

    prisma.account
      .update({
        data: {
          user: {
            update: filteredData,
          },
        },
        where: {
          provider_providerAccountId: {
            provider: 'twitch',
            providerAccountId: providerAccountId,
          },
        },
      })
      .then(() => {
        console.log('[TWITCHEVENTS] updated user info for', providerAccountId)
      })
      .catch((e) => {
        console.log('[TWITCHEVENTS] error saving new user info for', {
          e,
          providerAccountId: e.broadcasterId,
        })
      })
  } catch (e) {
    console.log('[TWITCHEVENTS] error on getStreamByUserId', { e })
  }

  try {
    SubscribeEvents([providerAccountId])
  } catch (e) {
    console.log('[TWITCHEVENTS] error on handlenewuser', { e })
  }
}
