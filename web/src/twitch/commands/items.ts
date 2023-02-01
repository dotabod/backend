import DOTA_ITEM_IDS from 'dotaconstants/build/item_ids.json' assert { type: 'json' }
import DOTA_ITEMS from 'dotaconstants/build/items.json' assert { type: 'json' }
import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { server } from '../../dota/index.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { getHeroNameById } from '../../dota/lib/heroes.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { SocketClient } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'
import { profileLink } from './stats.js'

async function getItems(client: SocketClient, profile: ReturnType<typeof profileLink>) {
  if (!client.steamServerId) {
    throw new CustomError(t('missingMatchData', { lng: client.locale }))
  }

  const delayedData = await server.dota.getDelayedMatchData({
    server_steamid: client.steamServerId,
    token: client.token,
  })

  if (!delayedData) {
    throw new CustomError(t('missingMatchData', { lng: client.locale }))
  }

  const teamIndex = profile.heroKey % 2
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
        const itemName: string | boolean = item && 'dname' in item && (item.dname as string)

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

  void chatClient.say(
    client.name,
    t('heroItems.list', {
      heroName: getHeroNameById(profile.heroid, profile.heroKey),
      itemNames: itemList.join(' · '),
      lng: client.locale,
    }),
  )
}

commandHandler.registerCommand('items', {
  aliases: ['item'],
  onlyOnline: true,
  dbkey: DBSettings.commandItems,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.gsi?.map?.matchid || !isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
      return
    }

    try {
      const profile = profileLink({
        players:
          gsiHandlers.get(client.token)?.players?.matchPlayers ||
          getCurrentMatchPlayers(client.gsi),
        locale: client.locale,
        currentMatchId: client.gsi.map.matchid,
        args: args,
      })

      void getItems(client, profile)
    } catch (e: any) {
      void chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
      )
      return
    }
  },
})
