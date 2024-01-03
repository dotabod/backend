import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import getHero, { HeroNames } from '../../dota/lib/getHero.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('lgs', {
  aliases: ['lastgamescore', 'lgscore', 'lgwl'],
  dbkey: DBSettings.commandLGS,
  handler: async (message, args) => {
    if (!message.channel.client.steam32Id) {
      chatClient.say(
        message.channel.name,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    const { steam32Id } = message.channel.client
    const { data: lg } = await supabase
      .from('bets')
      .select(
        `
          won,
          is_party,
          is_doubledown,
          matchId,
          kda,
          lobby_type,
          hero_name,
          created_at,
          updated_at
        `,
      )
      .eq('steam32Id', steam32Id)
      .not('won', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

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

    // calculate the time difference in minutes between created_at and updated_at
    const lasted = Math.floor(
      (new Date(lg.updated_at).getTime() - new Date(lg.created_at).getTime()) / 1000 / 60,
    )

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
  },
})
