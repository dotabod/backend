import { t } from 'i18next'

import RedisClient from '../../db/RedisClient.js'
import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { DBSettings } from '../../settings.js'
import { steamSocket } from '../../steam/ws.js'
import type { DelayedGames, Packet } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { profileLink } from './profileLink.js'

async function getStats({
  token,
  packet,
  args,
  locale,
  command,
}: {
  token: string
  packet?: Packet
  args: string[]
  locale: string
  command: string
}) {
  const { hero, player, playerIdx } = await profileLink({
    command,
    packet,
    locale,
    args: args,
  })

  if (!isSpectator(packet)) {
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
      }, 5000) // 5 second timeout

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

    const delayedData = await getDelayedDataPromise

    if (!delayedData) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    const teamIndex = (playerIdx ?? 0) > 4 ? 1 : 0
    const teamPlayerIdx = (playerIdx ?? 0) % 5
    const playerData = delayedData.teams[teamIndex]?.players[teamPlayerIdx]

    return {
      heroName: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
      kda: `${playerData.kill_count}/${playerData.death_count}/${playerData.assists_count}`,
      lasthits: playerData.lh_count,
      denies: playerData.denies_count,
      gold: playerData.gold,
      net_worth: playerData.net_worth,
      level: playerData.level,
    }
  }

  const playerData = player && 'last_hits' in player ? player : undefined
  const heroData = hero && 'level' in hero ? hero : undefined

  if (!playerData || !heroData) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  return {
    heroName: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
    kda: `${playerData?.kills}/${playerData?.deaths}/${playerData?.assists}`,
    lasthits: playerData?.last_hits,
    denies: playerData?.denies,
    gold: playerData?.gold,
    net_worth: playerData?.net_worth,
    level: heroData?.level,
  }
}

commandHandler.registerCommand('stats', {
  aliases: ['stat', 'kda', 'lh', 'gold', 'networth', 'level'],
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
      const stats = await getStats({
        token: client.token,
        packet: client.gsi,
        args,
        locale: client.locale,
        command,
      })
      const isSpec = isSpectator(client.gsi)
      let msg = t('heroStats', {
        ...stats,
        lng: client.locale,
      })
      if (!isSpec) {
        msg = `${t('2mdelay', { lng: client.locale })} ${msg}`
      }

      chatClient.say(client.name, msg, message.user.messageId)
    } catch (e: any) {
      const msg = !e?.message ? t('gameNotFound', { lng: client.locale }) : e?.message
      chatClient.say(client.name, msg, message.user.messageId)
    }
  },
})
