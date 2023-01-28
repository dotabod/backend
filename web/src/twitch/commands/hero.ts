import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { GSIHandler } from '../../dota/GSIHandler.js'
import { server } from '../../dota/index.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import getHero from '../../dota/lib/getHero.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

function speakHeroStats({
  win,
  lose,
  hero,
  channel,
  allTime,
  lng,
}: {
  allTime: boolean
  lose: number
  channel: string
  lng: string
  hero: { id: number; localized_name: string }
  win: number
}) {
  const total = (win || 0) + (lose || 0)
  const timeperiod = allTime
    ? t('herostats.timeperiod.lifetime', { lng })
    : t('herostats.timeperiod.days', { days: 30, lng })

  if (total > 0) {
    const winrate = !total ? 0 : Math.round(((win || 0) / total) * 100)
    void chatClient.say(
      channel,
      t('herostats.winrate', {
        lng,
        heroName: hero.localized_name,
        winrate,
        timeperiod,
        total,
      }),
    )
    return
  }

  if (!total) {
    void chatClient.say(
      channel,
      t('herostats.none', {
        lng,
        heroName: hero.localized_name,
        timeperiod,
      }),
    )
    return
  }
}

commandHandler.registerCommand('hero', {
  onlyOnline: true,
  dbkey: DBSettings.commandHero,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.steam32Id) {
      void chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
      return
    }
    const hero = getHero(client.gsi?.hero?.name)
    if (!hero) {
      void chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }

    const gsi = gsiHandlers.get(client.token)
    if (!gsi) return // this would never happen but its to satisfy typescript

    const allTime = args[0] === 'all'
    if (gsi.heroData) {
      const { win, lose } = gsi.heroData as { win: number; lose: number }
      speakHeroStats({ win, lose, hero, channel, allTime, lng: message.channel.client.locale })
    } else {
      void getHeroMsg({
        hero,
        channel,
        steam32Id: client.steam32Id,
        allTime,
        token: client.token,
        gsi,
        lng: message.channel.client.locale,
      })
    }
  },
})

interface HeroMsg {
  hero: { id: number; localized_name: string }
  channel: string
  steam32Id: number
  allTime: boolean
  token: string
  gsi: GSIHandler
  lng: string
}

async function getHeroMsg({ hero, channel, steam32Id, allTime, token, gsi, lng }: HeroMsg) {
  const data = {
    allTime,
    heroId: hero.id,
    steam32Id,
  }

  const sockets = await server.io.in(token).fetchSockets()
  if (sockets.length === 0) {
    void chatClient.say(channel, t('overlayMissing', { command: '!hero', lng }))
    return
  }

  sockets[0].timeout(15000).emit('requestHeroData', { data }, (err: any, response: any) => {
    gsi.heroData = response ?? null
    speakHeroStats({ win: response?.win, lose: response?.lose, lng, hero, channel, allTime })
  })
}
