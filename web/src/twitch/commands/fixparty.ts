import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { updateMmr } from '../../dota/lib/updateMmr.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

function togglePartyMmr(
  currentMmr: number,
  wasParty: boolean,
  didWin: boolean,
  isDoubledown: boolean,
) {
  const newmmr = currentMmr
  const baseDelta = isDoubledown ? 20 : 10
  const delta = wasParty ? -baseDelta : baseDelta
  return didWin ? newmmr - delta : newmmr + delta
}

commandHandler.registerCommand('fixparty', {
  aliases: ['fixsolo'],
  permission: 2,

  handler: (message: MessageType, args: string[]) => {
    async function handler() {
      const bet = await prisma.bet.findFirst({
        where: {
          userId: message.channel.client.token,
          won: {
            not: null,
          },
        },
        select: {
          matchId: true,
          won: true,
          is_party: true,
          id: true,
          is_doubledown: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (!bet) {
        void chatClient.say(
          message.channel.name,
          t('noLastMatch', { lng: message.channel.client.locale }),
        )
        return
      }

      void chatClient.say(
        message.channel.name,
        t('toggleMatch', {
          context: bet.is_party ? 'solo' : 'party',
          url: `dotabuff.com/matches/${bet.matchId}`,
          lng: message.channel.client.locale,
        }),
      )

      updateMmr(
        togglePartyMmr(message.channel.client.mmr, bet.is_party, !!bet.won, bet.is_doubledown),
        message.channel.client.steam32Id,
        message.channel.name,
      )

      await prisma.bet.update({
        where: {
          id: bet.id,
        },
        data: {
          is_party: !bet.is_party,
        },
      })
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in fixparty command', e)
    }
  },
})
