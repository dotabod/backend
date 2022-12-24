import { server } from '../../dota/index.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('test', {
  aliases: [],
  permission: 4, // Only admin is 4, not even streamer
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!client.steam32Id) {
      void chatClient.say(channel, 'Unknown steam ID. Play a match first!')
      return
    }

    const [steam32Id] = args
    async function handler() {
      if (!steam32Id || !client.steam32Id) {
        void chatClient.say(channel, 'No steam32Id? PauseChamp')
        return
      }

      const steamserverid = (await server.dota.getUserSteamServer(
        steam32Id || client.steam32Id,
      )) as string | undefined

      if (!steamserverid) {
        void chatClient.say(channel, 'Match not found PauseChamp')
        return
      }

      logger.info('test command', {
        command: 'TEST',
        steam32Id: steam32Id || client.steam32Id,
        steamserverid,
      })

      logger.info(
        `https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/?key=${process.env.STEAM_WEB_API}&server_steam_id=${steamserverid}`,
      )

      void chatClient.say(channel, 'Check console!')
    }

    void handler()
  },
})
