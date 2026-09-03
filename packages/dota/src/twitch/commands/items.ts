import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' with { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' with { type: 'json' }
import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { isSpectator } from '../../dota/lib/isSpectator'
import { DBSettings } from '../../settings'
import { findRealtimePlayer, getRealtimeStats } from '../../steam/realtimeStats'
import type { Item, SocketClient } from '../../types'
import CustomError from '../../utils/customError'
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
    command,
    client,
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
    const delayedData = await getRealtimeStats({
      client,
      token,
      locale,
      forceRefetchAll: true,
    }).catch((error) => {
      if (error instanceof CustomError) throw error
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
