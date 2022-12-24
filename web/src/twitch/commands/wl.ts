import { getWL } from '../../db/getWL.js'
import { DBSettings } from '../../db/settings.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('wl', {
  aliases: ['score', 'winrate', 'wr'],
  permission: 0,
  cooldown: 15000,
  onlyOnline: true,
  dbkey: DBSettings.commandWL,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message

    if (!client.steam32Id) {
      void chatClient.say(channel, 'Begin a match to save your account to Dotabod.')
      return
    }

    logger.info('[WL] Checking WL for steam32Id', client.steam32Id, client.name)

    getWL(channelId, client.stream_start_date)
      .then(({ msg }) => {
        void chatClient.say(channel, msg ?? 'Unknown WL')
      })
      .catch((e) => {
        void chatClient.say(channel, 'Stream not live PauseChamp')
      })
  },
})
