import { DBSettings } from '../../db/settings.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('apm', {



  onlyOnline: true,
  dbkey: DBSettings.commandAPM,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.gsi?.hero?.name) {
      void chatClient.say(channel, 'No hero found')
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, 'Not playing PauseChamp')
      return
    }

    const commandsIssued = client.gsi.player?.commands_issued ?? 0

    if (!commandsIssued) {
      void chatClient.say(channel, 'Live APM: 0 Chatting')
      return
    }

    const gameTime = client.gsi.map?.game_time ?? 1
    const apm = Math.round(commandsIssued / (gameTime / 60))

    void chatClient.say(channel, `Live APM: ${apm} Chatting`)
    return
  },
})
