import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { DBSettings } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('lgs', {
  aliases: ['lastgamescore', 'lgscore', 'lgwl'],

  onlyOnline: true,
  dbkey: DBSettings.commandLG,
  handler: (message: MessageType, args: string[]) => {
    if (!message.channel.client.steam32Id) {
      void chatClient.say(
        message.channel.name,
        t('unknownSteam', { lng: message.channel.client.locale }),
      )
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
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (!lg) {
        void chatClient.say(
          message.channel.name,
          t('noLastMatch', { lng: message.channel.client.locale }),
        )
        return
      }

      const additionals = []

      // calculate the time difference in minutes between createdAt and updatedAt
      const lasted = Math.floor((lg.updatedAt.getTime() - lg.createdAt.getTime()) / 1000 / 60)

      additionals.push(
        t('lastgamescore.duration', { minutes: lasted, lng: message.channel.client.locale }),
      )

      additionals.push(
        t('lastgamescore.ended', {
          minutes: Math.floor((Date.now() - lg.updatedAt.getTime()) / 1000 / 60),
          lng: message.channel.client.locale,
        }),
      )

      if (lg.is_party)
        additionals.push(t('lastgamescore.party', { lng: message.channel.client.locale }))
      if (lg.is_doubledown)
        additionals.push(t('lastgamescore.double', { lng: message.channel.client.locale }))
      if (lg.lobby_type !== 7)
        additionals.push(t('lastgamescore.unranked', { lng: message.channel.client.locale }))
      additionals.push(`dotabuff.com/matches/${lg.matchId}`)

      const wonMsg = lg.won
        ? t('lastgamescore.won', { lng: message.channel.client.locale })
        : t('lastgamescore.lost', { lng: message.channel.client.locale })
      void chatClient.say(
        message.channel.name,
        `${wonMsg}${additionals.length ? ' · ' : ''}${additionals.join(' · ')}`,
      )
    }

    void handler()
  },
})
