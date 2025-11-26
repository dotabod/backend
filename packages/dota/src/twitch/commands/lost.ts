import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { redisClient } from '../../db/redisInstance.js'
import { DBSettings } from '../../settings.js'
import { steamSocket } from '../../steam/ws.js'
import type { MatchMinimalDetailsResponse } from '../../types.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { resolveMatchRetroactively } from '../lib/resolveMatch.js'

commandHandler.registerCommand('lost', {
  permission: 2, // Mods and broadcaster only
  cooldown: 0,
  dbkey: DBSettings.commandLost,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
      user: { name: username },
    } = message

    // Check if a match ID was provided for retroactive resolution
    const matchIdArg = args[0]?.trim()
    if (matchIdArg) {
      // Validate that it looks like a match ID (numeric)
      if (!/^\d+$/.test(matchIdArg)) {
        chatClient.say(
          channel,
          t('bets.retroactiveMatchNotFound', {
            matchId: matchIdArg,
            emote: 'PauseChamp',
            lng: client.locale,
          }),
          message.user.messageId,
        )
        return
      }

      await resolveMatchRetroactively(
        client,
        matchIdArg,
        false, // lost
        username,
        channel,
        message.user.messageId,
      )
      return
    }

    try {
      // Check if there's a pending manual resolution
      const pendingResolution = await redisClient.client.get(
        `${client.token}:pendingManualResolution`,
      )

      if (!pendingResolution) {
        chatClient.say(
          channel,
          t('bets.noPendingResolution', {
            emote: 'PauseChamp',
            lng: client.locale,
          }),
          message.user.messageId,
        )
        return
      }

      const { matchId } = JSON.parse(pendingResolution)

      logger.info('[BETS] Manual resolution requested - lost', {
        name: client.name,
        matchId,
        resolvedBy: username,
      })

      // Get the team the player was on
      const myTeam = (await redisClient.client.get(`${client.token}:playingTeam`)) as
        | 'radiant'
        | 'dire'
        | null

      if (!myTeam) {
        logger.error('[BETS] Could not determine team for manual resolution', {
          name: client.name,
          matchId,
        })
        chatClient.say(
          channel,
          t('bets.manualResolutionError', {
            emote: 'PauseChamp',
            lng: client.locale,
          }),
          message.user.messageId,
        )
        return
      }

      // Get match details from Steam to pass to closeBets
      const getMatchDetailsPromise = new Promise<MatchMinimalDetailsResponse>((resolve, reject) => {
        steamSocket.emit(
          'getMatchMinimalDetails',
          { match_id: Number(matchId) },
          (err: any, response: any) => {
            if (err) {
              reject(err)
            } else {
              resolve(response)
            }
          },
        )
      })

      let gcData: MatchMinimalDetailsResponse | undefined
      try {
        gcData = await getMatchDetailsPromise
      } catch (e) {
        // If we can't get the data, we'll proceed without it
        logger.info('[BETS] Could not get match details for manual resolution, proceeding anyway', {
          matchId,
          error: e,
        })
      }

      // Clear the pending resolution flag
      await redisClient.client.del(`${client.token}:pendingManualResolution`)

      // Get the handler instance to call closeBets
      const handler = gsiHandlers.get(client.token)

      if (!handler) {
        logger.error('[BETS] Could not find GSI handler for manual resolution', {
          name: client.name,
          matchId,
        })
        chatClient.say(
          channel,
          t('bets.manualResolutionError', {
            emote: 'PauseChamp',
            lng: client.locale,
          }),
          message.user.messageId,
        )
        return
      }

      // Close bets with the losing team (opposite of player's team since they lost)
      const winningTeam = myTeam === 'radiant' ? 'dire' : 'radiant'
      await handler.closeBets(winningTeam, gcData)

      chatClient.say(
        channel,
        t('bets.manualResolutionSuccess', {
          context: 'lost',
          username,
          lng: client.locale,
        }),
        message.user.messageId,
      )
    } catch (error) {
      logger.error('[BETS] Error in manual resolution command (lost)', { error, channel })
      chatClient.say(
        channel,
        t('bets.manualResolutionError', {
          emote: 'PauseChamp',
          lng: client.locale,
        }),
        message.user.messageId,
      )
    }
  },
})
