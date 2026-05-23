import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' with { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' with { type: 'json' }
import { t } from 'i18next'

import RedisClient from '../../db/RedisClient'
import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { isSpectator } from '../../dota/lib/isSpectator'
import { DBSettings, ENABLE_SPECTATE_FRIEND_GAME } from '../../settings'
import { steamSocket } from '../../steam/ws'
import type { DelayedGames, Item, Packet, SocketClient } from '../../types'
import CustomError from '../../utils/customError'
import { is8500Plus } from '../../utils/index'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { profileLink } from './profileLink'

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
          const itemShortname = item.name.replace('item_', '') as keyof typeof DOTA_ITEMS
          const itemFound = DOTA_ITEMS[itemShortname]
          const itemName: string | boolean = itemFound && 'dname' in itemFound && itemFound.dname

          return itemName || itemShortname
        })
        .filter(Boolean)
        .filter((item) => item !== 'empty')
  } else {
    // PRESERVED — gated, not dead. The branches below (steamServerId redis read + getRealTimeStats
    // emit) come back to life if `ENABLE_SPECTATE_FRIEND_GAME` is re-enabled AND bot-streamer
    // friendship is managed at scale. See memory `keep-spectate-friend-path`.
    if (!ENABLE_SPECTATE_FRIEND_GAME) {
      throw new CustomError(t('matchDataValveDisabled', { emote: 'PoroSad', lng: locale }))
    }

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
        (err: unknown, cards: DelayedGames) => {
          clearTimeout(timeoutId)
          if (err) {
            reject(err)
          } else {
            resolve(cards)
          }
        },
      )
    })

    const delayedData = await getDelayedDataPromise.catch((_error) => {
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
          const id = String(itemId) as keyof typeof DOTA_ITEM_IDS
          const itemShortname = DOTA_ITEM_IDS[id] as keyof typeof DOTA_ITEMS
          const item = DOTA_ITEMS[itemShortname]
          const itemName: string | boolean = item && 'dname' in item && item.dname

          return itemName || itemShortname
        })
        .filter(Boolean)
  }

  // itemList can be `string[] | false` from the `Array.isArray && ... && ...` chain
  // above, so optional-chain would skip narrowing on the `false` arm.
  // biome-ignore lint/complexity/useOptionalChain: union with `false` (not nullish)
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
    } catch (e) {
      const msg = !(e as Error)?.message
        ? t('gameNotFound', { lng: client.locale })
        : (e as Error)?.message
      chatClient.say(client.name, msg, message.user.messageId)
    }
  },
})
