import { prisma } from '../../db/prisma.js'
import { DBSettings } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('lgs', {
  aliases: ['lastgamescore', 'lgscore', 'lgwl'],
  permission: 0,
  cooldown: 15000,
  onlyOnline: true,
  dbkey: DBSettings.commandLG,
  handler: (message: MessageType, args: string[]) => {
    if (!message.channel.client.steam32Id) {
      void chatClient.say(message.channel.name, 'Unknown steam ID. Play a match first!')
      return
    }

    const { steam32Id } = message.channel.client
    async function handler() {
      const lg = await prisma.bet.findFirst({
        where: {
          steam32Id: steam32Id,
          won: {
            not: null,
          },
        },
        select: {
          won: true,
          is_party: true,
          is_doubledown: true,
          matchId: true,
          lobby_type: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (!lg) {
        void chatClient.say(message.channel.name, 'Last game not found')
        return
      }

      const additionals = []
      additionals.push(
        `Ended ${Math.floor((Date.now() - lg.updatedAt.getTime()) / 1000 / 60)}m ago`,
      )

      if (lg.is_party) additionals.push('Party match')
      if (lg.is_doubledown) additionals.push('Double down')
      if (lg.lobby_type !== 7) additionals.push('Not ranked')
      additionals.push(`dotabuff.com/matches/${lg.matchId}`)

      void chatClient.say(
        message.channel.name,
        `Last game: ${lg.won ? 'won' : 'lost'} ${additionals.join(' · ')}`,
      )
    }

    void handler()
  },
})
