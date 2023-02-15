import { prisma } from './prisma.js'
import supabase from './supabase.js'
import { Account } from '../../prisma/generated/postgresclient/index.js'
import { SubscribeEvents } from '../twitch/events/index.js'
import BotAPI from '../twitch/lib/BotApiSingleton.js'

const channel = supabase.channel('twitch-changes')
const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_CHANNELIDS = process.env.DEV_CHANNELIDS?.split(',') ?? []
const botApi = BotAPI.getInstance()

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

    prisma.account
      .update({
        data: {
          user: {
            update: {
              displayName: streamer?.displayName,
              name: streamer?.name,
              followers: totalFollowerCount,
              stream_online: !!stream?.startDate,
              stream_start_date: stream?.startDate ?? null,
            },
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

    void handleNewUser(user.providerAccountId)
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE] Ready to receive database changes!')
    }
  })
