import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' with { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' with { type: 'json' }
import { t } from 'i18next'

import RedisClient from '../../db/RedisClient.js'
import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { DBSettings } from '../../settings.js'
import { steamSocket } from '../../steam/ws.js'
import type { DelayedGames, Item, Packet, SocketClient } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { is8500Plus } from '../../utils/index.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { profileLink } from './profileLink.js'

function formatItemList(itemList: string[]) {
  const itemCounts = {} as Record<string, number>
  const result = [] as string[]

  for (const item of itemList) {
    if (!itemCounts[item]) {
      itemCounts[item] = 1
    } else {
      itemCounts[item]++
    }
  }

  for (const item in itemCounts) {
    if (itemCounts[item] === 1) {
      result.push(item)
    } else {
      result.push(`${item} x${itemCounts[item]}`)
    }
  }

  return result
}

async function getItems({
  client,
  token,
  packet,
  args,
  locale,
  command,
}: {
  client: SocketClient
  token: string
  packet?: Packet
  args: string[]
  locale: string
  command: string
}) {
  const { hero, items, playerIdx } = await profileLink({
    command,
    packet,
    locale,
    args: args,
  })

  let itemList: string[] | false | undefined = false
  if (isSpectator(packet)) {
    itemList =
      items &&
      Object.values(items)
        .map((itemN) => {
          const item = itemN as Item
          const itemShortname = item.name.replace('item_', '') as unknown as keyof typeof DOTA_ITEMS
          const itemFound = DOTA_ITEMS[itemShortname]
          const itemName: string | boolean = itemFound && 'dname' in itemFound && itemFound.dname

          return itemName || itemShortname
        })
        .filter(Boolean)
        .filter((item) => item !== 'empty')
  } else {
    if (is8500Plus(client)) {
      throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
    }

    const redisClient = RedisClient.getInstance()
    const steamServerId =
      packet?.map?.matchid &&
      (await redisClient.client.get(`${packet?.map?.matchid}:${token}:steamServerId`))

    if (!steamServerId) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }
    const getDelayedDataPromise = new Promise<DelayedGames>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale })))
      }, 10000) // 10 second timeout

      steamSocket.emit(
        'getRealTimeStats',
        {
          match_id: packet?.map?.matchid ?? '',
          forceRefetchAll: true,
          steam_server_id: steamServerId,
          token,
        },
        (err: any, cards: any) => {
          clearTimeout(timeoutId)
          if (err) {
            reject(err)
          } else {
            resolve(cards)
          }
        },
      )
    })

    const delayedData = await getDelayedDataPromise.catch((error) => {
      throw new CustomError(t('gameNotFound', { lng: locale }))
    })

    if (!delayedData) {
      throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
    }

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
  }

  if (!itemList || !itemList.length) {
    throw new CustomError(
      t('heroItems.empty', {
        heroName: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        lng: locale,
      }),
    )
  }

  return {
    heroName: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
    itemNames: formatItemList(itemList).join(' · '),
    lng: locale,
  }
}

commandHandler.registerCommand('items', {
  aliases: ['item'],
  onlyOnline: true,
  dbkey: DBSettings.commandItems,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message

    const currentMatchId = client.gsi?.map?.matchid
    if (!currentMatchId) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    try {
      const res = await getItems({
        client,
        token: client.token,
        packet: client.gsi,
        args,
        locale: client.locale,
        command,
      })
      chatClient.say(client.name, t('heroItems.list', res), message.user.messageId)
    } catch (e: any) {
      const msg = !e?.message ? t('gameNotFound', { lng: client.locale }) : e?.message
      chatClient.say(client.name, msg, message.user.messageId)
    }
  },
})
