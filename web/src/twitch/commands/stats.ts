import { t } from 'i18next'

import { delayedGames } from '../../../prisma/generated/mongoclient/index.js'
import { getHeroNameById, heroColors } from '../../dota/lib/heroes.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import Mongo from '../../steam/mongo.js'
import CustomError from '../../utils/customError.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const mongo = await Mongo.connect()

export async function profileLink(currentMatchId: string, args: string[]) {
  if (!currentMatchId) {
    throw new CustomError('Not in a match PauseChamp')
  }

  if (!args.length) {
    throw new CustomError('Missing hero color. Try !stats blue')
  }

  // light blue can be an option
  const color = `${args[0].toLowerCase().trim()}${args[1]?.toLowerCase() === 'blue' ? ' blue' : ''}`
  let heroKey = heroColors.findIndex((heroColor) => heroColor.toLowerCase() === color)

  const colorKey = Number(args[0])
  if (colorKey && colorKey >= 1 && colorKey <= 10) {
    heroKey = colorKey - 1
  }

  if (heroKey === -1) {
    throw new CustomError(
      `Invalid hero color or slot. Must be 1-10, or one of ${heroColors.join(' ')}`,
    )
  }

  const response = (await mongo
    .collection('delayedGames')
    .findOne({ 'match.match_id': currentMatchId })) as unknown as delayedGames

  if (!response) {
    throw new CustomError('Waiting for current match data PauseChamp')
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

    profileLink(client.gsi.map.matchid, args)
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
