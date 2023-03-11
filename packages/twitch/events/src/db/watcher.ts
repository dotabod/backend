import { Account } from '@dotabod/prisma/dist/psql/index.js'

import { prisma } from './prisma.js'
import supabase from './supabase.js'
import { SubscribeEvents } from '../twitch/events/index.js'
import BotAPI from '../twitch/lib/BotApiSingleton.js'

const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_CHANNELIDS = process.env.DEV_CHANNELIDS?.split(',') ?? []
const botApi = BotAPI.getInstance()
const channel = supabase.channel(`${IS_DEV ? 'dev-' : ''}twitch-events`)

async function handleNewUser(providerAccountId: string) {
  console.log("New user, let's get their info", { userId: providerAccountId })

  if (!providerAccountId) {
    console.error("This should never happen, user doesn't have a providerAccountId", {
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
        console.log('updated user info for', providerAccountId)
      })
      .catch((e) => {
        console.log(e, 'error saving new user info for', e.broadcasterId)
      })
  } catch (e) {
    console.log(e, 'error on getStreamByUserId')
  }

  try {
    SubscribeEvents([providerAccountId])
  } catch (e) {
    console.log(e, 'error on handlenewuser')
  }
}

console.log('Starting psql subscriptions')

channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'accounts' }, (payload) => {
    const user = payload.new as Account
    if (IS_DEV && !DEV_CHANNELIDS.includes(user.providerAccountId)) return
    if (!IS_DEV && DEV_CHANNELIDS.includes(user.providerAccountId)) return

    handleNewUser(user.providerAccountId)
      .then(() => {
        console.log('done handling new user', { providerAccountId: user.providerAccountId })
      })
      .catch((e) => {
        console.error('error on handleNewUser', { e, providerAccountId: user.providerAccountId })
      })
  })
  .subscribe((status, err) => {
    console.log('[SUPABASE] Subscription status on twitch-events:', { status, err })
  })
