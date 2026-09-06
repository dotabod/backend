import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' with { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' with { type: 'json' }
import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { isSpectator } from '../../dota/lib/is-spectator'
import { DBSettings } from '../../settings'
import { findRealtimePlayer, getRealtimeStats } from '../../steam/realtime-stats'
import type { Item, SocketClient } from '../../types'
import CustomError from '../../utils/custom-error'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import { profileLink } from './profile-link'

const formatItemList = function formatItemList(itemList: string[]) {
  const itemCounts = {} as Record<string, number>
  const result = [] as string[]

  for (const item of itemList) {
    if (itemCounts[item]) {
      itemCounts[item] += 1
    } else {
      itemCounts[item] = 1
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

const getItems = async function getItems({
  client,
  token,
  args,
  locale,
  command,
}: {
  client: SocketClient
  token: string
  args: string[]
  locale: string
  command: string
}) {
  const packet = client.gsi
  const { accountIdFromArgs, hero, items, playerIdx } = await profileLink({
    args,
    client,
    command,
    locale,
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
    const delayedData = await getRealtimeStats({
      client,
      forceRefetchAll: true,
      locale,
      token,
    }).catch((error) => {
      if (error instanceof CustomError) {
        throw error
      }
      throw new CustomError(t('gameNotFound', { lng: locale }))
    })

    if (!delayedData) {
      throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
    }

    const itemIds = findRealtimePlayer(delayedData, accountIdFromArgs, playerIdx)?.items

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
  if (!itemList || !itemList.length) {
    throw new CustomError(
      t('heroItems.empty', {
        heroName: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        lng: locale,
      })
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
        message.user.messageId
      )
      return
    }

    try {
      const res = await getItems({
        args,
        client,
        command,
        locale: client.locale,
        token: client.token,
      })
      chatClient.say(client.name, t('heroItems.list', res), message.user.messageId)
    } catch (error) {
      const msg = (error as Error)?.message
        ? (error as Error)?.message
        : t('gameNotFound', { lng: client.locale })
      chatClient.say(client.name, msg, message.user.messageId)
    }
  },
  onlyOnline: true,
})
