import { heroColors } from '../../dota/lib/heroes.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import Dota from '../../steam/index.js'
import Mongo from '../../steam/mongo.js'
import CustomError from '../../utils/customError.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

const mongo = Mongo.getInstance()
const dota = Dota.getInstance()

export async function profileLink(matchId: string, color: string) {
  if (!matchId) throw new CustomError("Game wasn't found")
  if (!color) throw new CustomError('Missing hero color')

  const heroKey = heroColors.findIndex(
    (heroColor) => heroColor.toLowerCase() === color.toLowerCase(),
  )
  if (heroKey === -1) {
    throw new CustomError(`Invalid hero color. Must be one of ${heroColors.join(' ')}`)
  }

  const db = await mongo.db
  const response = await db.collection('delayedGames').findOne({ 'match.match_id': matchId })
  if (!response) throw new CustomError("Game wasn't found")

  const matchPlayers: { heroid: number; accountid: number }[] = [
    ...response.teams[0].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
    ...response.teams[1].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
  ]

  return `dotabuff.com/players/${matchPlayers[heroKey].accountid}`
}

commandHandler.registerCommand('stats', {
  aliases: ['check', 'profile'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    // if (!getValueOrDefault(DBSettings.commandStats, client.settings)) {
    //   return
    // }
    if (!client.gsi?.gamestate?.map?.matchid || !isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, 'Not playing PauseChamp')
      return
    }

    profileLink(client.gsi.gamestate.map.matchid, args[0])
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(message.channel.name, e?.message ?? 'Game was not found.')
      })
  },
})
