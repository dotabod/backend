import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { steamSocket } from '../../steam/ws.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('test', {
  permission: 4, // Only admin is 4, not even streamer

  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (args[0] === 'reset') {
      const handler = gsiHandlers.get(client.token)
      await handler?.resetClientState()

      chatClient.say(channel, 'Reset')
      return
    }

    if (args[0] === 'cards') {
      const { accountIds } = await getAccountsFromMatch({
        gsi: client.gsi,
      })
      steamSocket.emit('getCards', accountIds, (err: any, response: any) => {
        console.log(response) // one response per client
      })

      chatClient.say(channel, `cards! ${client.gsi?.map?.matchid}`)
      return
    }

    const [steam32Id] = args

    steamSocket.emit(
      'getUserSteamServer',
      steam32Id || client.steam32Id,
      (err: any, steamserverid: string) => {
        if (!steamserverid) {
          chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
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
      },
    )
  },
})
