import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from '../index.js'

commandHandler.registerCommand('xpm', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!getValueOrDefault(DBSettings.commandXPM, client.settings)) {
      return
    }
    if (!client.gsi?.hero?.name || !isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, 'Not playing PauseChamp')
      return
    }

    const xpm = client.gsi.player?.xpm

    if (!xpm) {
      void chatClient.say(channel, 'Live XPM: 0')
      return
    }

    void chatClient.say(channel, `Live XPM: ${xpm}`)
    return
  },
})
