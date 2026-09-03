import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { isSpectator } from '../../dota/lib/isSpectator'
import { DBSettings } from '../../settings'
import { findRealtimePlayer, getRealtimeStats } from '../../steam/realtimeStats'
import type { SocketClient } from '../../types'
import CustomError from '../../utils/customError'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { profileLink } from './profileLink'

async function getStats({
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
  const { accountIdFromArgs, hero, player, playerIdx } = await profileLink({
    command,
    client,
    locale,
    args: args,
  })

  if (!isSpectator(packet)) {
    const delayedData = await getRealtimeStats({
      client,
      token,
      locale,
      forceRefetchAll: true,
    }).catch((error) => {
      logger.error('Error getting stats', {
        error,
        match_id: packet?.map?.matchid ?? '',
        token,
      })
      if (error instanceof CustomError) throw error
      throw new CustomError(t('gameNotFound', { lng: locale }))
    })

    if (!delayedData) {
      throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
    }

    const playerData = findRealtimePlayer(delayedData, accountIdFromArgs, playerIdx)
    if (!playerData) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

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
    throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
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
        client,
        token: client.token,
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
    } catch (e) {
      const msg = !(e as Error)?.message
        ? t('gameNotFound', { lng: client.locale })
        : (e as Error)?.message
      chatClient.say(client.name, msg, message.user.messageId)
    }
  },
})
