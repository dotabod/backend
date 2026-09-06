import { logger, supabase } from '@dotabod/shared-utils'
import axios from 'axios'
import { t } from 'i18next'
import { z } from 'zod'

import type { DelayedGames } from '../../../../steam/src/types/index'
import { gsiHandlers } from '../../dota/lib/consts'
import { MatchDataService } from '../../dota/lib/matchData'
import MongoDBSingleton from '../../steam/mongo-db-singleton'
import { steamSocket } from '../../steam/ws'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

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
    `
    )
    .eq('name', name)
    .single()

  if (error) {
    console.error('Error fetching user:', error)
    return null
  }

  return user
}

const generateLogQuery = (user: Awaited<ReturnType<typeof fetchUserByName>>): string | null => {
  if (!user) {
    return null
  }

  const steamAccountQueries = user.steam_accounts
    .map((account: { steam32Id: number }) => `steam32Id:${account.steam32Id} or`)
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

const handleUserCommand = (message: MessageType) => {
  const {
    user: { userId },
    channel: { name: channel, client },
  } = message

  const accountId = client.Account?.providerAccountId ?? ''

  chatClient.whisper(
    userId,
    `
      Channel: ${channel}
      Account ID: ${accountId}
      Steam32 ID: ${client.steam32Id}
      Token: ${client.token}
    `
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

  try {
    const response = await new MatchDataService(channel.client).getCards()
    chatClient.whisper(user.userId, JSON.stringify(response))
  } catch (error) {
    chatClient.whisper(
      user.userId,
      `Error getting cards: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  chatClient.say(channel.name, `cards! ${channel.client.gsi?.map?.matchid}`)
}
const handleCardCommand = async (message: MessageType, args: string[]): Promise<void> => {
  const [, accountId] = args

  try {
    const response: unknown = await steamSocket
      .timeout(5000)
      .emitWithAck('getCard', Number(accountId))
    chatClient.whisper(message.user.userId, JSON.stringify(z.json().parse(response)))
    chatClient.say(message.channel.name, 'card!')
  } catch (error) {
    chatClient.whisper(
      message.user.userId,
      `Error getting card: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const handleLogsCommand = async (message: MessageType) => {
  const { user, channel } = message
  const userRecord = await fetchUserByName(channel.name.replace('#', ''))
  const query = generateLogQuery(userRecord)
  chatClient.whisper(user.userId, query !== null && query.length > 0 ? query : "Couldn't find user")
}

const handleServerCommand = async (message: MessageType, args: string[]) => {
  const { user, channel } = message
  const [, steam32Id] = args

  if (process.env.STEAM_WEB_API === undefined || process.env.STEAM_WEB_API.length === 0) {
    return
  }

  try {
    logger.info('[STEAM] Getting user steam server', {
      channelClientSteam32Id: channel.client.steam32Id,
      steam32Id,
    })
    const serverResponse: unknown = await steamSocket
      .timeout(10_000)
      .emitWithAck(
        'getUserSteamServer',
        steam32Id !== undefined && steam32Id.length > 0 ? steam32Id : channel.client.steam32Id
      )
    const steamServerId = z.string().min(1).parse(serverResponse)
    logger.info('[STEAM] Got user steam server', {
      channelClientSteam32Id: channel.client.steam32Id,
      steam32Id,
      steamServerId,
    })

    if (!steamServerId) {
      logger.error('[STEAM] No steam server id', {
        channelClientSteam32Id: channel.client.steam32Id,
        steam32Id,
        steamServerId,
      })
      chatClient.whisper(user.userId, t('gameNotFound', { lng: channel.client.locale }))
      return
    }

    logger.info('[STEAM] Getting game data for steam server id', {
      channelClientSteam32Id: channel.client.steam32Id,
      steam32Id,
      steamServerId,
    })
    chatClient.whisper(user.userId, `Getting game data for ${steamServerId}`)

    const gameResponse = await axios<DelayedGames>(
      `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steamServerId}`
    )
    const game = gameResponse.data
    logger.info('[STEAM] Got game data', {
      channelClientSteam32Id: channel.client.steam32Id,
      game,
      steam32Id,
      steamServerId,
    })
    chatClient.whisper(user.userId, JSON.stringify(game))
    chatClient.whisper(
      user.userId,
      `name: ${channel.name} steam32id: ${channel.client.steam32Id} token: ${channel.client.token}`
    )
  } catch (error: unknown) {
    logger.error('[STEAM] Error getting user steam server', {
      channelClientSteam32Id: channel.client.steam32Id,
      error,
      steam32Id,
    })
    if (error instanceof Error) {
      chatClient.whisper(user.userId, `Error: ${error.message}`)
    } else {
      chatClient.whisper(user.userId, `Error: ${String(error)}`)
    }
  }
}

const handle2mDataCommand = async (message: MessageType) => {
  const { user, channel } = message
  const matchId = channel.client.gsi?.map?.matchid

  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    const response = await db
      .collection<DelayedGames>('delayedGames')
      .findOne({ 'match.match_id': matchId })
    chatClient.whisper(user.userId, JSON.stringify(response))
  } catch (error) {
    console.error(error)
    chatClient.whisper(user.userId, 'Error fetching data')
  }
}

const handleSubscriptionCommand = (message: MessageType) => {
  chatClient.whisper(message.user.userId, JSON.stringify(message.channel.client.subscription))
}

commandHandler.registerCommand('test', {
  handler: async (message, args) => {
    switch (args[0]) {
      case 'subscription': {
        handleSubscriptionCommand(message)
        break
      }
      case 'user': {
        handleUserCommand(message)
        break
      }
      case 'game': {
        handleGameCommand(message)
        break
      }
      case '2m': {
        void handle2mDataCommand(message)
        break
      }
      case 'reset': {
        await handleResetCommand(message)
        break
      }
      case 'cards': {
        await handleCardsCommand(message)
        break
      }
      case 'card': {
        void handleCardCommand(message, args)
        break
      }
      case 'logs': {
        await handleLogsCommand(message)
        break
      }
      case 'server': {
        void handleServerCommand(message, args)
        break
      }
      default: {
        chatClient.whisper(message.user.userId, 'Invalid command')
      }
    }
  },

  permission: 4,
})
