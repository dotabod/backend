import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { getWL, LOBBY_TYPE_RANKED } from '../../db/get-wl'
import { isArcade } from '../../dota/lib/is-arcade'
import { isSpectator } from '../../dota/lib/is-spectator'
import { DBSettings, getValueOrDefault } from '../../settings'
import { getRedisNumberValue } from '../../utils/index'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('wl', {
  aliases: ['score', 'winrate', 'wr'],
  dbkey: DBSettings.commandWL,
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message

    if (client.steam32Id === null || client.steam32Id === 0) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount !== undefined &&
          message.channel.client.multiAccount !== 0
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

    const mmrEnabled = getValueOrDefault(
      DBSettings['mmr-tracker'],
      client.settings,
      client.subscription
    )

    // Check if user is currently in a game to determine which game type to show
    const currentMatchId = client.gsi?.map?.matchid
    const numericMatchId = Number(currentMatchId)
    const hasValidMatchId =
      currentMatchId !== undefined &&
      currentMatchId.length > 0 &&
      numericMatchId !== 0 &&
      !Number.isNaN(numericMatchId)
    let currentGameIsRanked: boolean | null = null

    if (hasValidMatchId && !isArcade(client.gsi) && !isSpectator(client.gsi)) {
      const lobbyType = await getRedisNumberValue(`${currentMatchId}:${client.token}:lobbyType`)
      if (lobbyType !== null) {
        currentGameIsRanked = lobbyType === LOBBY_TYPE_RANKED
      }
    }

    try {
      const res = await getWL({
        channelId,
        currentGameIsRanked,
        lng: client.locale,
        mmrEnabled,
        settings: client.settings,
        streamStartDate: client.stream_start_date,
        subscription: client.subscription,
        userId: client.token,
      })

      if (res?.msg !== null && res?.msg !== undefined && res.msg.length > 0) {
        chatClient.say(channel, res.msg, message.user.messageId)
      }
    } catch (error) {
      logger.error('[WL] Error getting WL', { channelId, error, name: client.name })
    }
  },
})
