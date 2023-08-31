import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getHeroByName, getHeroNameById, heroColors } from '../../dota/lib/heroes.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { profileLink } from './profileLink.js'

interface Player {
  heroid: number
  accountid: number // steam32 id
}

export interface ProfileLinkParams {
  command: string
  locale: string
  currentMatchId: string
  args: string[]
  players?: Player[]
}

export function getPlayerFromArgs({
  args,
  players,
  locale,
  command,
}: {
  args: string[]
  players: Player[]
  locale: string
  command: string
}) {
  if (!args.length) {
    throw new CustomError(
      t('invalidColorNew', { command, colorList: heroColors.join(' · '), lng: locale }),
    )
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
    // hero name input or alias
    const heroName = args.join('').toLowerCase().trim()
    const hero = getHeroByName(heroName)
    heroKey = hero ? players.findIndex((player) => player.heroid === hero.id) : -1
  }

  if (heroKey < 0 || heroKey > 9) {
    throw new CustomError(
      t('invalidColorNew', { command, colorList: heroColors.join(' · '), lng: locale }),
    )
  }

  return { heroKey, player: players[heroKey] }
}

commandHandler.registerCommand('stats', {
  aliases: ['check', 'profile'],
  onlyOnline: true,

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

    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })

    try {
      const profile = profileLink({
        command,
        players: matchPlayers,
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
