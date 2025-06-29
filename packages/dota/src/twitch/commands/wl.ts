import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { getWL, LOBBY_TYPE_RANKED } from '../../db/getWL.js'
import { isArcade } from '../../dota/lib/isArcade.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { getRedisNumberValue } from '../../utils/index.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('wl', {
  aliases: ['score', 'winrate', 'wr'],
  dbkey: DBSettings.commandWL,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message

    if (!client.steam32Id) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    const mmrEnabled = getValueOrDefault(
      DBSettings['mmr-tracker'],
      client.settings,
      client.subscription,
    )

    // Check if user is currently in a game to determine which game type to show
    const currentMatchId = client.gsi?.map?.matchid
    let currentGameIsRanked: boolean | null = null

    if (
      currentMatchId &&
      Number(currentMatchId) &&
      !isArcade(client.gsi) &&
      !isSpectator(client.gsi)
    ) {
      const lobbyType = await getRedisNumberValue(`${currentMatchId}:${client.token}:lobbyType`)
      if (lobbyType !== null) {
        currentGameIsRanked = lobbyType === LOBBY_TYPE_RANKED
      }
    }

    try {
      const res = await getWL({
        lng: client.locale,
        channelId: channelId,
        mmrEnabled: mmrEnabled,
        startDate: client.stream_start_date,
        currentGameIsRanked: currentGameIsRanked,
      })

      if (res?.msg) {
        chatClient.say(channel, res.msg, message.user.messageId)
      }
    } catch (e) {
      logger.error('[WL] Error getting WL', { error: e, channelId, name: client.name })
    }
  },
})
