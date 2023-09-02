import { DBSettings } from '@dotabod/settings'
import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' assert { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' assert { type: 'json' }
import { t } from 'i18next'

import { redisClient } from '../../dota/GSIHandler.js'
import { server } from '../../dota/index.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../../dota/lib/heroes.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { Item, SocketClient } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findGSIByAccountId } from './findGSIByAccountId.js'
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

async function getItems(
  client: SocketClient,
  profile: ReturnType<typeof profileLink>,
  matchId: string,
) {
  const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })
  if (!matchPlayers.length) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: client.locale }))
  }

  let itemList: string[] | false | undefined = false
  if (isSpectator(client.gsi)) {
    const { items } = findGSIByAccountId(client.gsi, profile.accountid)
    itemList =
      items &&
      Object.values(items)
        .map((item: Item) => {
          const itemShortname = item.name.replace('item_', '') as unknown as keyof typeof DOTA_ITEMS
          const itemFound = DOTA_ITEMS[itemShortname]
          const itemName: string | boolean = itemFound && 'dname' in itemFound && itemFound.dname

          return itemName || itemShortname
        })
        .filter(Boolean)
        .filter((item) => item !== 'empty')
  } else {
    const steamServerId =
      client.gsi?.map?.matchid &&
      (await redisClient.client.get(`${client.gsi?.map?.matchid}:steamServerId`))

    if (!steamServerId) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: client.locale }))
    }

    const delayedData = await server.dota.GetRealTimeStats({
      match_id: matchId,
      forceRefetchAll: true,
      steam_server_id: steamServerId,
      token: client.token,
    })

    if (!delayedData) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: client.locale }))
    }

    const teamIndex = profile.heroKey > 4 ? 1 : 0
    const teamPlayerIdx = profile.heroKey % 5
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
        heroName: getHeroNameById(profile.heroid, profile.heroKey),
        lng: client.locale,
      }),
    )
  }

  return {
    heroName: getHeroNameById(profile.heroid, profile.heroKey),
    itemNames: formatItemList(itemList).join(' · '),
    lng: client.locale,
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
      )
      return
    }

    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })

    try {
      const profile = profileLink({
        command,
        players: matchPlayers,
        locale: client.locale,
        currentMatchId,
        args: args,
      })

      getItems(client, profile, currentMatchId)
        .then((res) => {
          chatClient.say(client.name, t('heroItems.list', res))
        })
        .catch((e: any) => {
          const msg = !e?.message ? t('gameNotFound', { lng: client.locale }) : e?.message
          chatClient.say(client.name, msg)
        })
    } catch (e: any) {
      const msg = !e?.message ? t('gameNotFound', { lng: client.locale }) : e?.message
      chatClient.say(client.name, msg)
    }
  },
})
