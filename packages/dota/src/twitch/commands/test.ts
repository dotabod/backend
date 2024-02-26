import { sendExtensionPubSubBroadcastMessage } from '@twurple/ebs-helper'
import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' assert { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' assert { type: 'json' }
import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { steamSocket } from '../../steam/ws.js'
import { DelayedGames } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('test', {
  permission: 4, // Only admin is 4, not even streamer

  handler: async (message, args) => {
    const {
      user: { userId },
      channel: { name: channel, client },
    } = message

    if (args[0] === 'pub') {
      const config = {
        clientId: process.env.TWITCH_EXT_CLIENT_ID!,
        secret: process.env.TWITCH_EXT_SECRET!,
        ownerId: process.env.TWITCH_BOT_PROVIDERID!,
      }

      const accountId = client.Account?.providerAccountId ?? ''

      await sendExtensionPubSubBroadcastMessage(
        config,
        accountId,
        JSON.stringify({
          items: ['blink', 'bottle', 'boots'],
          neutral: 'enchanted_mango',
          hero: 70,
          abilities: [
            'antimage_mana_break',
            'antimage_blink',
            'antimage_spell_shield',
            'antimage_mana_void',
          ],
          heroes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        }),
      )
    }

    if (args[0] === 'user') {
      const accountId = client.Account?.providerAccountId ?? ''
      chatClient.whisper(userId, `${channel} ${accountId} ${client.steam32Id} ${client.token}`)
    }

    if (args[0] === 'reset') {
      const handler = gsiHandlers.get(client.token)
      await handler?.resetClientState()

      chatClient.say(channel, 'Reset')
      return
    }

    if (args[0] === 'items') {
      const [, matchId, steam32Id] = args
      let itemList: string[] | false | undefined = false

      steamSocket.emit('getUserSteamServer', steam32Id, async (err: any, steamServerId: string) => {
        chatClient.whisper(
          userId,
          `${channel} ${steamServerId} ${client.steam32Id} ${client.token}`,
        )

        if (!steamServerId) {
          chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
          return
        }

        logger.info('test command', {
          command: 'TEST',
          steam32Id: steam32Id || client.steam32Id,
          steamServerId,
        })

        const getDelayedDataPromise = new Promise<DelayedGames>((resolve, reject) => {
          steamSocket.emit(
            'getRealTimeStats',
            {
              match_id: matchId,
              forceRefetchAll: true,
              steam_server_id: steamServerId,
              token: client.token,
            },
            (err: any, cards: any) => {
              if (err) {
                reject(err)
              } else {
                resolve(cards)
              }
            },
          )
        })

        const playerIdx = 1
        const delayedData = await getDelayedDataPromise
        const teamIndex = (playerIdx ?? 0) > 4 ? 1 : 0
        const teamPlayerIdx = (playerIdx ?? 0) % 5
        const itemIds = delayedData.teams[teamIndex]?.players[teamPlayerIdx]?.items

        itemList =
          Array.isArray(itemIds) &&
          itemIds.length > 0 &&
          itemIds
            .map((itemId) => {
              const id = itemId as unknown as keyof typeof DOTA_ITEM_IDS
              const itemShortname = DOTA_ITEM_IDS[id] as keyof typeof DOTA_ITEMS
              const item = DOTA_ITEMS[itemShortname]
              const itemName: string | boolean = item && 'dname' in item && item.dname

              return itemName || itemShortname
            })
            .filter(Boolean)

        console.log(itemList)
      })
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

    const [steam32Id] = args

    steamSocket.emit(
      'getUserSteamServer',
      steam32Id || client.steam32Id,
      (err: any, steamServerId: string) => {
        console.log({ steamServerId })
        if (!steamServerId) {
          chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
          return
        }

        logger.info('test command', {
          command: 'TEST',
          steam32Id: steam32Id || client.steam32Id,
          steamServerId,
        })

        chatClient.whisper(
          userId,
          `${channel} https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process
            .env
            .STEAM_WEB_API!}&server_steam_id=${steamServerId} ${client.steam32Id} ${client.token}`,
        )
      },
    )
  },
})
