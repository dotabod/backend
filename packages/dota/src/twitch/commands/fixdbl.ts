import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { updateMmr } from '../../dota/lib/updateMmr.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

interface DoubledownMmr {
  currentMmr: number
  isParty: boolean
  didWin: boolean
  wasDoubledown: boolean
}

export function toggleDoubledownMmr({ currentMmr, isParty, didWin, wasDoubledown }: DoubledownMmr) {
  const change = isParty ? 20 : 25
  return currentMmr + change * (didWin === wasDoubledown ? -1 : 1)
}

commandHandler.registerCommand('fixdbl', {
  aliases: ['fixdd'],
  permission: 2,
  cooldown: 0,
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
        chatClient.say(
          message.channel.name,
          t('noLastMatch', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        )
        return
      }

      chatClient.say(
        message.channel.name,
        t('toggleMatch', {
          context: bet.is_doubledown ? 'single' : 'double',
          url: `dotabuff.com/matches/${bet.matchId}`,
          lng: message.channel.client.locale,
        }),
      )

      updateMmr({
        tellChat: !message.channel.client.stream_online,
        currentMmr: message.channel.client.mmr,
        newMmr: toggleDoubledownMmr({
          currentMmr: message.channel.client.mmr,
          isParty: bet.is_party,
          didWin: !!bet.won,
          wasDoubledown: bet.is_doubledown,
        }),
        steam32Id: message.channel.client.steam32Id,
        channel: message.channel.name,
      })

      await prisma.bet.update({
        where: {
          id: bet.id,
        },
        data: {
          is_doubledown: !bet.is_doubledown,
        },
      })
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in fixdbl command', { e })
    }
  },
})
