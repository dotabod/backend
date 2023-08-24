import { DBSettings } from '@dotabod/settings'
import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' assert { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' assert { type: 'json' }
import { t } from 'i18next'

import { redisClient } from '../../dota/GSIHandler.js'
import { server } from '../../dota/index.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../../dota/lib/heroes.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { SocketClient } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../index.js'
import commandHandler from '../lib/CommandHandler.js'
import { profileLink } from './stats.js'

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
  const steamServerId =
    client.gsi?.map?.matchid &&
    (await redisClient.client.get(`${client.gsi?.map?.matchid}:steamServerId`))

  if (!steamServerId) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: client.locale }))
  }

  const { matchPlayers } = await getAccountsFromMatch(client.gsi)

  if (!matchPlayers.length) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: client.locale }))
  }

  const delayedData = await server.dota.getDelayedMatchData({
    server_steamid: steamServerId,
    itemsOnly: true,
    token: client.token,
    match_id: matchId,
  })

  if (!delayedData) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: client.locale }))
  }

  const teamIndex = profile.heroKey > 4 ? 1 : 0
  const teamPlayerIdx = profile.heroKey % 5
  const list = delayedData.teams[teamIndex]?.players[teamPlayerIdx]?.items
  const itemList: string[] | false =
    Array.isArray(list) &&
    list.length > 0 &&
    list
      .map((itemId) => {
        const id = itemId as unknown as keyof typeof DOTA_ITEM_IDS
        const itemShortname = DOTA_ITEM_IDS[id] as keyof typeof DOTA_ITEMS
        const item = DOTA_ITEMS[itemShortname]
        const itemName: string | boolean = item && 'dname' in item && item.dname

        return itemName || itemShortname
      })
      .filter(Boolean)

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
    if (!client.gsi?.map?.matchid || !isPlayingMatch(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }

    const currentMatchId = client.gsi.map.matchid

    const { matchPlayers } = await getAccountsFromMatch(client.gsi)

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
