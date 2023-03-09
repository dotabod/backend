import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import RedisClient from '../../db/redis.js'
import { GSIHandler } from '../../dota/GSIHandler.js'
import { server } from '../../dota/index.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { getHeroById, heroColors, translatedColor } from '../../dota/lib/heroes.js'
import { isArcade } from '../../dota/lib/isArcade.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'
import { profileLink } from './stats.js'

const redisClient = RedisClient.getInstance()

function speakHeroStats({
  win,
  lose,
  hero,
  channel,
  allTime,
  profile,
  ourHero,
  lng,
}: {
  allTime: boolean
  ourHero: boolean
  lose: number
  profile: ReturnType<typeof profileLink>
  channel: string
  lng: string
  hero: { id: number; localized_name: string }
  win: number
}) {
  const total = (win || 0) + (lose || 0)
  const timeperiod = allTime
    ? t('herostats.timeperiod.lifetime', { lng })
    : t('herostats.timeperiod.days', { count: 30, lng })

  if (total > 0) {
    const winrate = !total ? 0 : Math.round(((win || 0) / total) * 100)
    const langProps = {
      lng,
      heroName: hero.localized_name,
      winrate,
      timeperiod,
      count: total,
      color: translatedColor(heroColors[profile.heroKey], lng),
    }
    const desc = ourHero
      ? t('herostats.winrateStreamer', langProps)
      : t('herostats.winrateColor', langProps)
    chatClient.say(channel, desc)
    return
  }

  if (!total) {
    const langProps = {
      lng,
      heroName: hero.localized_name,
      timeperiod,
      color: translatedColor(heroColors[profile.heroKey], lng),
    }
    const desc = ourHero
      ? t('herostats.noneStreamer', langProps)
      : t('herostats.noneColor', langProps)
    chatClient.say(channel, desc)
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
      chatClient.say(
        channel,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    const gsi = gsiHandlers.get(client.token)
    if (!gsi) return // this would never happen but its to satisfy typescript
    if (!client.gsi?.map?.matchid || isArcade(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }

    try {
      const gsiHandle = gsiHandlers.get(client.token)
      if (!gsiHandle) return // this would never happen but its to satisfy typescript

      const ourHero = !args.length
      const profile = profileLink({
        players: gsiHandle.players?.matchPlayers || getCurrentMatchPlayers(client.gsi),
        locale: client.locale,
        currentMatchId: client.gsi.map.matchid,
        // defaults to the hero the user is playing
        args: gsiHandle.playingHeroSlot && ourHero ? [`${gsiHandle.playingHeroSlot + 1}`] : args,
      })

      const hero = getHeroById(profile.heroid)
      if (!hero) {
        chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
        return
      }

      const allTime = args[0] === 'all'
      const data = gsi.heroDatas[profile.accountid]
      if (data) {
        const { win, lose } = data
        speakHeroStats({
          win,
          lose,
          profile,
          ourHero,
          hero,
          channel,
          allTime,
          lng: message.channel.client.locale,
        })
      } else {
        void getHeroMsg({
          hero,
          channel,
          ourHero,
          profile,
          steam32Id: profile.accountid,
          allTime,
          token: client.token,
          gsi,
          lng: message.channel.client.locale,
        })
      }
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
      )
    }
  },
})

interface HeroMsg {
  ourHero: boolean
  profile: ReturnType<typeof profileLink>
  hero: { id: number; localized_name: string }
  channel: string
  steam32Id: number
  allTime: boolean
  token: string
  gsi: GSIHandler
  lng: string
}

async function getHeroMsg({
  ourHero,
  hero,
  channel,
  steam32Id,
  allTime,
  token,
  gsi,
  lng,
  profile,
}: HeroMsg) {
  const data = {
    allTime,
    heroId: hero.id,
    steam32Id,
  }

  if (ourHero) {
    const isPrivate = await redisClient.client.get(`${token}:isPrivate`)
    if (Number(isPrivate) === 1) {
      chatClient.say(channel, t('privateProfile', { command: '!hero', lng }))
      return
    }
  }

  const sockets = await server.io.in(token).fetchSockets()
  if (sockets.length === 0) {
    chatClient.say(channel, t('overlayMissing', { command: '!hero', lng }))
    return
  }

  sockets[0].timeout(15000).emit('requestHeroData', { data }, (err: any, response: any) => {
    gsi.heroDatas[steam32Id] = response ?? null
    speakHeroStats({
      ourHero,
      profile,
      win: response?.win,
      lose: response?.lose,
      lng,
      hero,
      channel,
      allTime,
    })
  })
}
