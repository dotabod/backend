import { delayedGames } from '../../../prisma/generated/mongoclient/index.js'
import { DBSettings } from '../../db/settings.js'
import Mongo from '../../steam/mongo.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const mongo = await Mongo.connect()
commandHandler.registerCommand('ranked', {
  aliases: ['isranked'],
  permission: 0,
  cooldown: 15000,
  dbkey: DBSettings.commandRanked,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!client.steam32Id) {
      void chatClient.say(channel, 'Unknown steam ID. Play a match first!')
      return
    }

    const currentMatchId = client.gsi?.map?.matchid

    async function handler() {
      if (!currentMatchId) {
        void chatClient.say(channel, 'Not in a match PauseChamp')
        return
      }

      const response = (await mongo
        .collection('delayedGames')
        .findOne({ 'match.match_id': currentMatchId })) as unknown as delayedGames | undefined

      if (!response) {
        void chatClient.say(channel, 'Waiting for current match data PauseChamp')
        return
      }

      if (response.match.lobby_type === 7) {
        void chatClient.say(channel, 'Yes this game is ranked')
        return
      }

      void chatClient.say(channel, 'Nope this game is not ranked')
    }

    void handler()
  },
})