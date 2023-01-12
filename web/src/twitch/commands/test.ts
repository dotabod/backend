import { t } from 'i18next'

import { server } from '../../dota/index.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('test', {
  permission: 4, // Only admin is 4, not even streamer

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!client.steam32Id) {
      void chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }

    const [steam32Id] = args
    async function handler() {
      if (!steam32Id || !client.steam32Id) {
        void chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
        return
      }

      const steamserverid = await server.dota.getUserSteamServer(steam32Id || client.steam32Id)

      if (!steamserverid) {
        void chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
        return
      }

      logger.info('test command', {
        command: 'TEST',
        steam32Id: steam32Id || client.steam32Id,
        steamserverid,
      })

      logger.info(
        `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env
          .STEAM_WEB_API!}&server_steam_id=${steamserverid}`,
      )
    }

    void handler()
  },
})
