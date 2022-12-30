import { DBSettings } from '../../db/settings.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('xpm', {



  onlyOnline: true,
  dbkey: DBSettings.commandXPM,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.gsi?.hero?.name) {
      void chatClient.say(channel, 'Hero not found')
      return
    }
    if (!isPlayingMatch(client.gsi)) {
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
