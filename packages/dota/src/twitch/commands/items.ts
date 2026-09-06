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

const DOTA_ITEM_BY_SHORTNAME = new Map(Object.entries(DOTA_ITEMS))
const DOTA_ITEM_SHORTNAME_BY_ID = new Map(Object.entries(DOTA_ITEM_IDS))

const isItem = function isItem(value: unknown): value is Item {
  return (
    typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
  )
}

const formatItemList = function formatItemList(itemList: string[]) {
  const itemCounts = new Map<string, number>()
  const result: string[] = []

  for (const item of itemList) {
    itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1)
  }

  for (const [item, count] of itemCounts) {
    if (count === 1) {
      result.push(item)
    } else {
      result.push(`${item} x${count}`)
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

  let itemList: string[]
  if (isSpectator(packet)) {
    itemList = (items === undefined ? [] : Object.values(items))
      .filter(isItem)
      .map((itemN) => {
        const itemShortname = itemN.name.replace('item_', '')
        const itemFound = DOTA_ITEM_BY_SHORTNAME.get(itemShortname)

        return itemFound !== undefined && 'dname' in itemFound ? itemFound.dname : itemShortname
      })
      .filter(Boolean)
      .filter((item) => item !== 'empty')
  } else {
    let delayedData
    try {
      delayedData = await getRealtimeStats({
        client,
        forceRefetchAll: true,
        locale,
        token,
      })
    } catch (error) {
      if (error instanceof CustomError) {
        throw error
      }
      throw new CustomError(t('gameNotFound', { lng: locale }))
    }

    const itemIds = findRealtimePlayer(delayedData, accountIdFromArgs, playerIdx)?.items

    itemList = (Array.isArray(itemIds) ? itemIds : [])
      .map((itemId) => {
        const itemShortname = DOTA_ITEM_SHORTNAME_BY_ID.get(String(itemId))
        if (itemShortname === undefined) {
          return null
        }
        const item = DOTA_ITEM_BY_SHORTNAME.get(itemShortname)

        return item !== undefined && 'dname' in item ? item.dname : itemShortname
      })
      .filter((itemName): itemName is string => itemName !== null)
  }

  if (itemList.length === 0) {
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
    if (currentMatchId === undefined || currentMatchId.length === 0) {
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
      const msg =
        error instanceof Error && error.message.length > 0
          ? error.message
          : t('gameNotFound', { lng: client.locale })
      chatClient.say(client.name, msg, message.user.messageId)
    }
  },
  onlyOnline: true,
})
