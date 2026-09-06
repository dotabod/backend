import { logger, supabase } from '@dotabod/shared-utils'
import type { Database } from '@dotabod/shared-utils'

type UserUpdate = Database['public']['Tables']['users']['Update']

// const botApi = getBotInstance()
export interface TwitchUserUpdateEvent {
  user_id: string
  user_login: string
  user_name: string
  email?: string
  email_verified?: boolean
  description: string
}

export const updateUserEvent = function updateUserEvent({
  payload: { event },
}: {
  payload: { event: TwitchUserUpdateEvent }
}) {
  logger.info(`${event.user_id} updateUserEvent`)

  const handler = async function handler() {
    try {
      // TODO: Add profile image back
      // const streamer = await botApi.users.getUserById(event.user_id)

      const filteredData: UserUpdate = {}
      if (event.user_login) {
        filteredData.name = event.user_login
      }
      if (event.user_name) {
        filteredData.displayName = event.user_name
      }
      if (event.email !== undefined && event.email.length > 0) {
        filteredData.email = event.email
      }

      const { data: user } = await supabase
        .from('accounts')
        .select('userId')
        .eq('providerAccountId', event.user_id)
        .eq('provider', 'twitch')
        .single()

      if (user?.userId === undefined || user.userId.length === 0) {
        logger.info('[TWITCHEVENTS] user not found', { twitchId: event.user_id })
        return
      }

      await supabase.from('users').update(filteredData).eq('id', user.userId)
    } catch (error) {
      console.error(error, 'updateUserEvent error', event.user_id)
    }
  }

  void handler()
}
