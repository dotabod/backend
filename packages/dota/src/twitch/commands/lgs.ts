import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import getHero, { HeroNames } from '../../dota/lib/getHero.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('lgs', {
  aliases: ['lastgamescore', 'lgscore', 'lgwl'],
  dbkey: DBSettings.commandLG,
  handler: (message: MessageType, args: string[]) => {
    if (!message.channel.client.steam32Id) {
      chatClient.say(
        message.channel.name,
        message.channel.client.multiAccount ? t('multiAccount', { lng: message.channel.client.locale, url: 'dotabod.com/dashboard/features' }) : t('unknownSteam', { lng: message.channel.client.locale }),
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
          kda: true,
          lobby_type: true,
          hero_name: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (!lg) {
        chatClient.say(
          message.channel.name,
          t('noLastMatch', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        )
        return
      }

      const returnMsg = []

      returnMsg.push(
        lg.won
          ? t('lastgamescore.won', { lng: message.channel.client.locale })
          : t('lastgamescore.lost', { lng: message.channel.client.locale }),
      )

      const kda = lg.kda as {
        kills: number | null
        deaths: number | null
        assists: number | null
      } | null
      if (kda) {
        const kdaMsg = `${kda.kills ?? 0}/${kda.deaths ?? 0}/${kda.assists ?? 0}`
        returnMsg.push(
          t('lastgamescore.kda', {
            lng: message.channel.client.locale,
            heroName:
              getHero(lg.hero_name as HeroNames)?.localized_name ??
              t('unknown', { lng: message.channel.client.locale }),
            kdavalue: kdaMsg,
          }),
        )
      }

      // calculate the time difference in minutes between createdAt and updatedAt
      const lasted = Math.floor((lg.updatedAt.getTime() - lg.createdAt.getTime()) / 1000 / 60)

      returnMsg.push(
        t('lastgamescore.duration', { minutes: lasted, lng: message.channel.client.locale }),
      )

      if (lg.is_party)
        returnMsg.push(t('lastgamescore.party', { lng: message.channel.client.locale }))
      if (lg.is_doubledown)
        returnMsg.push(t('lastgamescore.double', { lng: message.channel.client.locale }))
      if (lg.lobby_type !== 7)
        returnMsg.push(t('lastgamescore.unranked', { lng: message.channel.client.locale }))
      returnMsg.push(`dotabuff.com/matches/${lg.matchId}`)

      chatClient.say(message.channel.name, returnMsg.join(' · '))
    }

    void handler()
  },
})
