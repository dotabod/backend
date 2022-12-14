import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('apm', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!getValueOrDefault(DBSettings.commandAPM, client.settings)) {
      return
    }
    if (!client.gsi?.hero?.name || !isPlayingMatch(client.gsi)) {
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
