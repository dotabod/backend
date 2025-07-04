import { logger, supabase } from '@dotabod/shared-utils'
import axios from 'axios'
import { t } from 'i18next'
import type { DelayedGames } from '../../../../steam/src/types/index.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { heroes } from '../../dota/lib/heroList.js'
import { server } from '../../dota/server.js'
import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import { steamSocket } from '../../steam/ws.js'
import { getWinProbability2MinAgo } from '../../stratz/livematch.js'
import CustomError from '../../utils/customError.js'
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

  const accountId = client.Account?.providerAccountId ?? ''

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

  const getCardsPromise = new Promise<any>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: channel.client.locale })))
    }, 10000) // 5 second timeout

    steamSocket.emit('getCards', accountIds, false, (err: any, response: any) => {
      clearTimeout(timeoutId)
      if (err) {
        reject(err)
      } else {
        resolve(response)
      }
    })
  })

  try {
    const response = await getCardsPromise
    chatClient.whisper(user.userId, JSON.stringify(response))
  } catch (error) {
    chatClient.whisper(
      user.userId,
      `Error getting cards: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  chatClient.say(channel.name, `cards! ${channel.client.gsi?.map?.matchid}`)
}
const handleCardCommand = (message: MessageType, args: string[]) => {
  const [, accountId] = args

  const getCardPromise = new Promise<any>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new CustomError(
          t('matchData8500', { emote: 'PoroSad', lng: message.channel.client.locale }),
        ),
      )
    }, 5000) // 5 second timeout

    steamSocket.emit('getCard', Number(accountId), (err: any, response: any) => {
      clearTimeout(timeoutId)
      if (err) {
        reject(err)
      } else {
        resolve(response)
      }
    })
  })

  getCardPromise
    .then((response) => {
      chatClient.whisper(message.user.userId, JSON.stringify(response))
      chatClient.say(message.channel.name, 'card!')
    })
    .catch((error) => {
      chatClient.whisper(message.user.userId, `Error getting card: ${error.message}`)
    })
}

const handleLogsCommand = async (message: MessageType) => {
  const { user, channel } = message
  const userRecord = await fetchUserByName(channel.name.replace('#', ''))
  const query = generateLogQuery(userRecord)
  chatClient.whisper(user.userId, query || "Couldn't find user")
}

const handleWpCommand = async (message: MessageType, args: string[]) => {
  if (!message?.channel?.client?.gsi?.map?.matchid) {
    chatClient.whisper(message.user.userId, 'No match id found')
    return
  }

  const details = await getWinProbability2MinAgo(
    Number.parseInt(message.channel.client.gsi.map.matchid, 10),
  )
  chatClient.whisper(message.user.userId, JSON.stringify(details))
}

const handleServerCommand = async (message: MessageType, args: string[]) => {
  const { user, channel } = message
  const [, steam32Id] = args

  if (!process.env.STEAM_WEB_API) {
    return
  }

  const getDelayedDataPromise = new Promise<string>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: channel.client.locale })))
    }, 10000) // 10 second timeout

    steamSocket.emit(
      'getUserSteamServer',
      steam32Id || channel.client.steam32Id,
      (err: any, steamServerId: string) => {
        clearTimeout(timeoutId)
        if (err) {
          reject(err)
        } else {
          resolve(steamServerId)
        }
      },
    )
  })

  try {
    const steamServerId = await getDelayedDataPromise

    if (!steamServerId) {
      chatClient.whisper(user.userId, t('gameNotFound', { lng: channel.client.locale }))
      return
    }

    chatClient.whisper(user.userId, `Getting game data for ${steamServerId}`)

    const game = (
      await axios<DelayedGames>(
        `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steamServerId}`,
      )
    )?.data
    chatClient.whisper(user.userId, JSON.stringify(game))
    chatClient.whisper(
      user.userId,
      `name: ${channel.name} steam32id: ${channel.client.steam32Id} token: ${channel.client.token}`,
    )
  } catch (error: unknown) {
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

async function fixWins(token: string, twitchChatId: string, currentMatchId?: string) {
  const ONE_DAY_IN_MS = 86_400_000 // 1 day in ms
  const dayAgo = new Date(Date.now() - ONE_DAY_IN_MS).toISOString()

  const { data: matches } = await supabase
    .from('matches')
    .select('id, matchId, myTeam, userId, hero_name')
    .is('won', null)
    .eq('userId', token)
    .neq('matchId', currentMatchId ?? '')
    .gte('created_at', dayAgo)
    .order('created_at', { ascending: false })
    .range(0, 10)

  chatClient.whisper(
    twitchChatId,
    matches?.map((b) => b.matchId).join(', ') || 'No broken games found',
  )

  if (!matches) return

  await Promise.all(
    matches.map(async (bet) => {
      const heroId = bet?.hero_name ? heroes[bet.hero_name as keyof typeof heroes]?.id || 0 : 0
      const sockets = await server.io.in(bet.userId).fetchSockets()
      if (!Array.isArray(sockets) || !sockets.length) return
      chatClient.whisper(
        twitchChatId,
        `Requesting opendota match data from overlay for match "${bet.matchId}" with hero id "${heroId}"...`,
      )
      const lastSocket = sockets[sockets.length - 1]
      try {
        const response = await new Promise<{
          radiantWin: boolean
          radiantScore: number
          direScore: number
          kills: number
          deaths: number
          assists: number
          lobbyType: number
        } | null>((resolve, reject) => {
          lastSocket
            .timeout(25000)
            .emit(
              'requestMatchData',
              { matchId: bet.matchId, heroId },
              (err: any, response: any) => {
                chatClient.whisper(
                  twitchChatId,
                  `Match ${bet.matchId}: ${JSON.stringify(response)}`,
                )
                if (err) {
                  chatClient.whisper(
                    twitchChatId,
                    `Error for match ${bet.matchId}: ${JSON.stringify(err)}`,
                  )
                }
                if (err) resolve(null)
                else resolve(response)
              },
            )
        })

        if (typeof response?.radiantWin === 'boolean') {
          const radiantWin = response.radiantWin && bet.myTeam === 'radiant'
          const direWin = !response.radiantWin && bet.myTeam === 'dire'

          await supabase
            .from('matches')
            .update({
              radiant_score: response?.radiantScore,
              dire_score: response?.direScore,
              kda: { kills: response?.kills, deaths: response?.deaths, assists: response?.assists },
              won: radiantWin || direWin,
              lobby_type: response.lobbyType,
              updated_at: new Date().toISOString(),
            })
            .eq('id', bet.id)
        }
      } catch (e) {
        chatClient.whisper(twitchChatId, `Error fetching match data: ${JSON.stringify(e)}`)
        logger.error('Error fetching sockets', { e })
      }
    }),
  )

  const handler = gsiHandlers.get(token)
  handler?.emitWLUpdate()
}

const handleSubscriptionCommand = async (message: MessageType) => {
  chatClient.whisper(message.user.userId, JSON.stringify(message.channel.client.subscription))
}

commandHandler.registerCommand('test', {
  permission: 4,

  handler: async (message, args) => {
    switch (args[0]) {
      case 'subscription':
        await handleSubscriptionCommand(message)
        break
      case 'user':
        handleUserCommand(message, args)
        break
      case 'game':
        handleGameCommand(message)
        break
      case '2m':
        handle2mDataCommand(message)
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
      case 'wp':
        handleWpCommand(message, args)
        break
      case 'fixwins':
        await fixWins(
          message.channel.client.token,
          message.user.userId,
          message.channel.client.gsi?.map?.matchid,
        )
        break
      default:
        chatClient.whisper(message.user.userId, 'Invalid command')
    }
  },
})
