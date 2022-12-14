import { getWL } from '../../db/getWL.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('wl', {
  aliases: ['score', 'winrate', 'wr'],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message

    if (!getValueOrDefault(DBSettings.commandWL, client.settings)) {
      return
    }

    if (!client.steam32Id) {
      void chatClient.say(channel, 'Begin a match to save your account to Dotabod.')
      return
    }

    console.log('[WL] Checking WL for steam32Id', client.steam32Id, client.name)

    getWL(channelId)
      .then(({ msg }) => {
        void chatClient.say(channel, msg ?? 'Unknown WL')
      })
      .catch((e) => {
        void chatClient.say(channel, 'Stream not live PauseChamp')
      })
  },
})
