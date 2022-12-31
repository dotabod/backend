import { t } from 'i18next'

import { delayedGames } from '../../../prisma/generated/mongoclient/index.js'
import { getHeroNameById, heroColors } from '../../dota/lib/heroes.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import Mongo from '../../steam/mongo.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const mongo = await Mongo.connect()

export async function profileLink(locale: string, currentMatchId: string, args: string[]) {
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { lng: locale }))
  }

  if (!args.length) {
    throw new CustomError(t('invalidColor', { colorList: heroColors.join(' '), lng: locale }))
  }

  // light blue can be an option
  const color = `${args[0].toLowerCase().trim()}${args[1]?.toLowerCase() === 'blue' ? ' blue' : ''}`
  let heroKey = heroColors.findIndex((heroColor) => heroColor.toLowerCase() === color)

  const colorKey = Number(args[0])
  if (colorKey && colorKey >= 1 && colorKey <= 10) {
    heroKey = colorKey - 1
  }

  if (heroKey === -1) {
    throw new CustomError(t('invalidColor', { colorList: heroColors.join(' '), lng: locale }))
  }

  const response = (await mongo
    .collection('delayedGames')
    .findOne({ 'match.match_id': currentMatchId })) as unknown as delayedGames

  if (!response) {
    throw new CustomError(t('missingMatchData', { lng: locale }))
  }

  const matchPlayers = response.teams.flatMap((team) => team.players)
  const player = matchPlayers[heroKey]

  return `Here's ${getHeroNameById(player.heroid, heroKey)}: dotabuff.com/players/${
    player.accountid
  }`
}

commandHandler.registerCommand('stats', {
  aliases: ['check', 'profile'],

  onlyOnline: true,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    // if (!getValueOrDefault(DBSettings.commandStats, client.settings)) {
    //   return
    // }

    if (!client.gsi?.map?.matchid) {
      void chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
      return
    }

    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
      return
    }

    profileLink(client.locale, client.gsi.map.matchid, args)
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        )
      })
  },
})
