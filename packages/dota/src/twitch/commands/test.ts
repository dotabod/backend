import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { steamSocket } from '../../steam/ws.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

const getLogQuery = async (name: string) => {
  const { data: user, error } = await supabase
    .from('users')
    .select(
      `
    name,
    id,
    Account:accounts (
      providerAccountId
    ),
    SteamAccount:steam_accounts (
      steam32Id
    )
  `,
    )
    .eq('name', name)
    .single()

  if (error) {
    console.error(error)
    return
  }

  if (!user) return ''

  return `
channel:${user.name} or
name:${user.name} or
${user.SteamAccount.map((a) => `steam32Id:${a.steam32Id} or`).join(' ')}
token:${user.id} or
userId:${user.id} or
user:${user.id} or
token:${user.Account?.providerAccountId ?? ''} or
message:Starting! or
twitchId:${user.Account?.providerAccountId ?? ''}
`
}

commandHandler.registerCommand('test', {
  permission: 4, // Only admin is 4, not even streamer

  handler: async (message, args) => {
    const {
      user: { userId },
      channel: { name: channel, client },
    } = message

    if (args[0] === 'user') {
      const accountId = client.Account?.providerAccountId ?? ''
      chatClient.whisper(userId, `${channel} ${accountId} ${client.steam32Id} ${client.token}`)
      return
    }

    if (args[0] === 'reset') {
      const handler = gsiHandlers.get(client.token)
      await handler?.resetClientState()

      chatClient.whisper(userId, 'Reset')
      return
    }

    if (args[0] === 'cards') {
      const { accountIds } = await getAccountsFromMatch({
        gsi: client.gsi,
      })
      steamSocket.emit('getCards', accountIds, false, (err: any, response: any) => {
        console.log(response, err) // one response per client
      })

      chatClient.say(channel, `cards! ${client.gsi?.map?.matchid}`)
      return
    }

    if (args[0] === 'card') {
      const [, accountId] = args

      steamSocket.emit('getCard', Number(accountId), (err: any, response: any) => {
        console.log({ response, err }) // one response per client
      })

      chatClient.say(channel, 'card!')
      return
    }

    if (args[0] === 'logs') {
      const query = await getLogQuery(channel)
      chatClient.whisper(userId, query || "Couldn't find user")
      return
    }

    if (args[0] === 'server') {
      const [steam32Id] = args

      steamSocket.emit(
        'getUserSteamServer',
        steam32Id || client.steam32Id,
        (err: any, steamServerId: string) => {
          chatClient.whisper(userId, steamServerId)
          if (!steamServerId) {
            chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
            return
          }

          chatClient.whisper(
            userId,
            `${channel} https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process
              .env
              .STEAM_WEB_API!}&server_steam_id=${steamServerId} ${client.steam32Id} ${client.token}`,
          )
        },
      )

      return
    }
  },
})
