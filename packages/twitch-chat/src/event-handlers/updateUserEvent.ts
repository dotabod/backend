import { logger, supabase } from '@dotabod/shared-utils'

// const botApi = getBotInstance()
interface TwitchUserUpdateEvent {
  user_id: string
  user_login: string
  user_name: string
  email?: string
  email_verified?: boolean
  description: string
}

export function updateUserEvent({
  payload: { event },
}: { payload: { event: TwitchUserUpdateEvent } }) {
  logger.info(`${event.user_id} updateUserEvent`)

  async function handler() {
    try {
      // TODO: Add profile image back
      // const streamer = await botApi.users.getUserById(event.user_id)

      const data = {
        name: event.user_login,
        displayName: event.user_name,
        email: event.email,
        // image: streamer.profilePictureUrl,
      }

      // remove falsy values from data (like displayName: undefined)
      const filteredData = Object.fromEntries(
        Object.entries(data).filter(([key, value]) => Boolean(value)),
      )

      const { data: user } = await supabase
        .from('accounts')
        .select('userId')
        .eq('providerAccountId', event.user_id)
        .eq('provider', 'twitch')
        .single()

      if (!user || !user.userId) {
        logger.info('[TWITCHEVENTS] user not found', { twitchId: event.user_id })
        return
      }

      await supabase
        .from('users')
        .update(filteredData as typeof data)
        .eq('id', user.userId)
    } catch (err) {
      console.error(err, 'updateUserEvent error', event.user_id)
    }
  }

  void handler()
}
