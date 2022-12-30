import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('friends', {
  permission: 4,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchid = client.gsi?.map?.matchid

    if (!client.gsi?.hero?.name) {
      void chatClient.say(channel, 'No hero found')
      return
    }
    if (!isPlayingMatch(client.gsi) || !matchid) {
      void chatClient.say(channel, 'Not playing PauseChamp')
      return
    }

    void chatClient.say(channel, `Match ID: ${matchid}`)
  },
})
