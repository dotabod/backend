import { User } from '../../prisma/generated/postgresclient/index.js'
import { getBotAPI } from '../twitch/lib/getBotAPI.js'
import { listener } from '../twitch/lib/listener.js'
import { offlineEvent } from '../twitch/lib/offlineEvent.js'
import { onlineEvent } from '../twitch/lib/onlineEvent.js'
import { prisma } from './prisma.js'
import supabase from './supabase.js'

const channel = supabase.channel('twitch-changes')

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
    const botApi = getBotAPI()
    const stream = await botApi.streams.getStreamByUserId(user.providerAccountId)
    if (stream?.startDate) {
      // @ts-expect-error asdf
      onlineEvent({
        broadcasterId: user.providerAccountId,
        startDate: stream.startDate,
      })
    }
  } catch (e) {
    console.log(e, 'error on getStreamByUserId')
  }

  try {
    await listener.subscribeToStreamOnlineEvents(user.providerAccountId, onlineEvent)
    await listener.subscribeToStreamOfflineEvents(user.providerAccountId, offlineEvent)
  } catch (e) {
    console.log(e, 'error on handlenewuser')
  }
}

channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    const user = payload.new as User
    console.log('[SUPABASE] New user to subscribe online events for: ', user.name)
    void handleNewUser(user.id)
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE] Ready to receive database changes!')
    }
  })
