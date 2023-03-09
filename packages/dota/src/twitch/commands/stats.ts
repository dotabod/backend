import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { getHeroByName, getHeroNameById, heroColors } from '../../dota/lib/heroes.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

interface Player {
  heroid: number
  accountid: number // steam32 id
}

interface ProfileLinkParams {
  locale: string
  currentMatchId: string
  args: string[]
  players?: Player[]
}

export function getPlayerFromArgs(args: string[], players: Player[], locale: string) {
  if (!args.length) {
    throw new CustomError(t('invalidColor', { colorList: heroColors.join(' · '), lng: locale }))
  }

  // herokey is 0-9
  let heroKey: number | undefined
  const color = args[0].toLowerCase().trim()
  const heroColorIndex = heroColors.findIndex((heroColor) => heroColor.toLowerCase() === color)

  const colorKey = Number(args[0])
  if (colorKey && colorKey >= 1 && colorKey <= 10) {
    // 1-10 input
    heroKey = colorKey - 1
  } else if (heroColorIndex !== -1) {
    // color input
    heroKey = heroColorIndex
  } else {
    // hero name input
    const heroName = args.join('').toLowerCase().trim()
    const hero = getHeroByName(heroName)
    heroKey = hero ? players.findIndex((player) => player.heroid === hero.id) : -1
  }

  if (heroKey < 0 || heroKey > 9) {
    throw new CustomError(t('invalidColor', { colorList: heroColors.join(' '), lng: locale }))
  }

  return { heroKey, player: players[heroKey] }
}

export function profileLink({ players, locale, currentMatchId, args }: ProfileLinkParams) {
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }))
  }

  if (!Number(currentMatchId)) {
    throw new CustomError(t('gameNotFound', { lng: locale }))
  }

  if (!players?.length) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  const { player, heroKey } = getPlayerFromArgs(args, players, locale)
  return { heroKey, ...player }
}

commandHandler.registerCommand('stats', {
  aliases: ['check', 'profile'],
  onlyOnline: true,

  handler: (message: MessageType, args: string[]) => {
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

    try {
      const profile = profileLink({
        players:
          gsiHandlers.get(client.token)?.players?.matchPlayers ||
          getCurrentMatchPlayers(client.gsi),
        locale: client.locale,
        currentMatchId: client.gsi.map.matchid,
        args: args,
      })

      const desc = t('profileUrl', {
        lng: client.locale,
        channel: getHeroNameById(profile.heroid, profile.heroKey),
        url: `dotabuff.com/players/${profile.accountid}`,
      })

      chatClient.say(message.channel.name, desc)
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
      )
    }
  },
})
