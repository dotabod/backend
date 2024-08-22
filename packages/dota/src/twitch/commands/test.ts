import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { steamSocket } from '../../steam/ws.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

const fetchUserByName = async (name: string) => {
  const { data: user, error } = await supabase
    .from('users')
    .select(
      `
      name,
      id,
      accounts (
        providerAccountId
      ),
      steam_accounts (
        steam32Id
      )
    `,
    )
    .eq('name', name)
    .single()

  if (error) {
    console.error('Error fetching user:', error)
    return null
  }

  return user
}

const generateLogQuery = (user: Awaited<ReturnType<typeof fetchUserByName>>) => {
  if (!user) return

  const steamAccountQueries = user.steam_accounts
    .map((account: any) => `steam32Id:${account.steam32Id} or`)
    .join(' ')

  return `
    channel:${user.name} or
    name:${user.name} or
    ${steamAccountQueries}
    token:${user.id} or
    userId:${user.id} or
    message:*${user.id}* or
    user:${user.id} or
    token:${user.accounts?.providerAccountId ?? ''} or
    message:Starting! or
    twitchId:${user.accounts?.providerAccountId ?? ''} or
    lookupToken:${user.accounts?.providerAccountId ?? ''}
  `
}

const handleUserCommand = (message: MessageType, args: string[]) => {
  const {
    user: { userId },
    channel: { name: channel, client },
  } = message

  const accountId = client.accounts?.providerAccountId ?? ''

  chatClient.whisper(
    userId,
    `
      Channel: ${channel}
      Account ID: ${accountId}
      Steam32 ID: ${client.steam32Id}
      Token: ${client.token}
    `,
  )
}

const handleGameCommand = (message: MessageType) => {
  const { user, channel } = message
  chatClient.whisper(user.userId, JSON.stringify(channel.client.gsi))
}

const handleResetCommand = async (message: MessageType) => {
  const { user, channel } = message
  const handler = gsiHandlers.get(channel.client.token)
  await handler?.resetClientState()

  chatClient.whisper(user.userId, 'Reset')
}

const handleCardsCommand = async (message: MessageType) => {
  const { user, channel } = message
  const { accountIds } = await getAccountsFromMatch({
    gsi: channel.client.gsi,
  })
  steamSocket.emit('getCards', accountIds, false, (err: any, response: any) => {
    console.log(response, err) // one response per client
  })

  chatClient.say(channel.name, `cards! ${channel.client.gsi?.map?.matchid}`)
}

const handleCardCommand = (message: MessageType, args: string[]) => {
  const [, accountId] = args

  steamSocket.emit('getCard', Number(accountId), (err: any, response: any) => {
    console.log({ response, err }) // one response per client
  })

  chatClient.say(message.channel.name, 'card!')
}

const handleLogsCommand = async (message: MessageType) => {
  const { user, channel } = message
  const userRecord = await fetchUserByName(channel.name.replace('#', ''))
  const query = generateLogQuery(userRecord)
  chatClient.whisper(user.userId, query || "Couldn't find user")
}

const handleServerCommand = (message: MessageType, args: string[]) => {
  const { user, channel } = message
  const [, steam32Id] = args

  if (!process.env.STEAM_WEB_API) {
    return
  }

  steamSocket.emit(
    'getUserSteamServer',
    steam32Id || channel.client.steam32Id,
    (err: any, steamServerId: string) => {
      if (!steamServerId) {
        chatClient.say(channel.name, t('gameNotFound', { lng: channel.client.locale }))
        return
      }

      chatClient.whisper(
        user.userId,
        `${channel.name} https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steamServerId} ${channel.client.steam32Id} ${channel.client.token}`,
      )
    },
  )
}

commandHandler.registerCommand('test', {
  permission: 4,

  handler: async (message, args) => {
    switch (args[0]) {
      case 'user':
        handleUserCommand(message, args)
        break
      case 'game':
        handleGameCommand(message)
        break
      case 'reset':
        await handleResetCommand(message)
        break
      case 'cards':
        await handleCardsCommand(message)
        break
      case 'card':
        handleCardCommand(message, args)
        break
      case 'logs':
        await handleLogsCommand(message)
        break
      case 'server':
        handleServerCommand(message, args)
        break
      default:
        chatClient.whisper(message.user.userId, 'Invalid command')
    }
  },
})
