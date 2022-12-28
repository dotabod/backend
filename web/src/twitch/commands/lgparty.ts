import { prisma } from '../../db/prisma.js'
import { updateMmr } from '../../dota/lib/updateMmr.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

function calculateMmr(currentMmr: number, wasParty: boolean, didWin: boolean) {
  const mmrChange = didWin ? 10 : -10
  return currentMmr + mmrChange * (wasParty ? 1 : -1)
}

commandHandler.registerCommand('lgparty', {
  aliases: ['fixparty', 'fixsolo'],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    async function handler() {
      const bet = await prisma.bet.findFirst({
        where: {
          userId: message.channel.client.token,
          won: {
            not: null,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (!bet) {
        void chatClient.say(message.channel.name, `Did not find a last match PauseChamp`)
        return
      }

      void chatClient.say(
        message.channel.name,
        `Changing this match to ${bet.is_party ? 'solo' : 'party'} mmr: dotabuff.com/matches/${
          bet.matchId
        } Type !fixsolo to undo`,
      )

      updateMmr(
        calculateMmr(message.channel.client.mmr, bet.is_party, !!bet.won),
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
      logger.error('Error in lgparty command', e)
    }
  },
})
