import supabase from './db/supabase.js'
import { initUserSubscriptions } from './initUserSubscriptions.js'
import { getBotInstance } from './twitch/lib/BotApiSingleton.js'
import { logger } from './twitch/lib/logger.js'

const botApi = getBotInstance()
export async function handleNewUser(providerAccountId: string, resubscribeEvents = true) {
  logger.info("[TWITCHEVENTS] New user, let's get their info", { userId: providerAccountId })

  if (!providerAccountId) {
    logger.info("[TWITCHEVENTS] This should never happen, user doesn't have a providerAccountId", {
      providerAccountId,
    })
    return
  }

  try {
    const stream = await botApi.streams.getStreamByUserId(providerAccountId)
    const streamer = await botApi.users.getUserById(providerAccountId)

    const data = {
      displayName: streamer?.displayName,
      name: streamer?.name,
      stream_online: !!stream?.startDate,
      stream_start_date: stream?.startDate.toISOString() ?? null,
    }

    // remove falsy values from data (like displayName: undefined)
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => Boolean(value)),
    )

    const { data: user } = await supabase
      .from('accounts')
      .select('userId')
      .eq('providerAccountId', providerAccountId)
      .eq('provider', 'twitch')
      .single()

    if (!user || !user.userId) {
      logger.info('[TWITCHEVENTS] user not found', { providerAccountId })
      return
    }

    await supabase
      .from('users')
      .update(filteredData as typeof data)
      .eq('id', user.userId)
  } catch (e) {
    logger.info('[TWITCHEVENTS] error on getStreamByUserId', { e })
  }

  if (resubscribeEvents) {
    try {
      initUserSubscriptions(providerAccountId)
    } catch (e) {
      logger.info('[TWITCHEVENTS] error on handlenewuser', { e })
    }
  }
}
