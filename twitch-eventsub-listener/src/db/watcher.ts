import { prisma } from './prisma.js'
import supabase from './supabase.js'
import { User } from '../../prisma/generated/postgresclient/index.js'
import { SubscribeEvents } from '../twitch/events/index.js'
import { getBotAPIStatic } from '../twitch/lib/getBotAPIStatic.js'

const channel = supabase.channel('twitch-changes')
const IS_DEV = process.env.NODE_ENV !== 'production'
const DEV_CHANNELS = process.env.DEV_CHANNELS?.split(',') ?? []

async function handleNewUser(userId: string) {
  const user = await prisma.account.findFirst({
    select: { providerAccountId: true },
    where: {
      user: {
        id: userId,
      },
    },
  })

  if (!user?.providerAccountId) return

  try {
    const botApi = getBotAPIStatic()
    const stream = await botApi.streams.getStreamByUserId(user.providerAccountId)
    const streamer = await stream?.getUser()
    const follows = botApi.users.getFollowsPaginated({
      followedUser: user.providerAccountId,
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
            providerAccountId: user.providerAccountId,
          },
        },
      })
      .then(() => {
        console.log('updated user info for', user.providerAccountId)
      })
      .catch((e) => {
        console.log(e, 'error saving new user info for', e.broadcasterId)
      })
  } catch (e) {
    console.log(e, 'error on getStreamByUserId')
  }

  try {
    SubscribeEvents([user.providerAccountId])
  } catch (e) {
    console.log(e, 'error on handlenewuser')
  }
}

channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    const user = payload.new as User
    if (IS_DEV && !DEV_CHANNELS.includes(user.name)) return
    if (!IS_DEV && DEV_CHANNELS.includes(user.name)) return

    console.log('[SUPABASE] New user to subscribe online events for: ', { name: user.name })
    void handleNewUser(user.id)
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE] Ready to receive database changes!')
    }
  })
