import { t } from 'i18next'

import { server } from '../../dota/index.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import Dota from '../../steam/index.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
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
      const dota = Dota.getInstance()
      await dota.getCards(accountIds, true)

      chatClient.say(channel, `cards! ${client.gsi?.map?.matchid}`)
      return
    }

    const [steam32Id] = args
    if (!client.steam32Id || !steam32Id) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    const steamserverid = await server.dota.getUserSteamServer(steam32Id || client.steam32Id)

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
})
