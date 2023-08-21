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

type heroRecords =
  | {
      win: number
      lose: number
    }
  | undefined

function handleNotPlaying(message: MessageType) {
  chatClient.say(
    message.channel.name,
    t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
  )
}
function handleNoSteam32Id(message: MessageType) {
  chatClient.say(
    message.channel.name,
    message.channel.client.multiAccount
      ? t('multiAccount', {
          lng: message.channel.client.locale,
          url: 'dotabod.com/dashboard/features',
        })
      : t('unknownSteam', { lng: message.channel.client.locale }),
  )
}

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

  if (!total) {
    const langProps = {
      lng,
      heroName: hero.localized_name,
      timeperiod,
      color: translatedColor(heroColors[profile.heroKey], lng),
    }
    chatClient.say(
      channel,
      t(ourHero ? 'herostats.noneStreamer' : 'herostats.noneColor', langProps),
    )
    return
  }

  const winrate = Math.round(((win || 0) / total) * 100)
  const langProps = {
    lng,
    heroName: hero.localized_name,
    winrate,
    timeperiod,
    count: total,
    color: translatedColor(heroColors[profile.heroKey], lng),
  }
  chatClient.say(
    channel,
    t(ourHero ? 'herostats.winrateStreamer' : 'herostats.winrateColor', langProps),
  )
}

commandHandler.registerCommand('hero', {
  onlyOnline: true,
  dbkey: DBSettings.commandHero,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message
    return
    if (!client.steam32Id) return handleNoSteam32Id(message)

    const gsi = gsiHandlers.get(client.token)
    if (!gsi || !client.gsi?.map?.matchid || isArcade(client.gsi)) return handleNotPlaying(message)

    try {
      const gsi = gsiHandlers.get(client.token)
      if (!gsi) return // this would never happen but its to satisfy typescript

      const playingHeroSlot = Number(
        await redisClient.client.get(`${client.token}:playingHeroSlot`),
      )
      const ourHero = !args.length
      const profile = profileLink({
        command,
        players: gsi.players?.matchPlayers || getCurrentMatchPlayers(client.gsi),
        locale: client.locale,
        currentMatchId: client.gsi.map.matchid,
        // defaults to the hero the user is playing
        args: playingHeroSlot >= 0 && ourHero ? [`${playingHeroSlot + 1}`] : args,
      })

      const hero = getHeroById(profile.heroid)
      if (!hero) return chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))

      const allTime = args[0] === 'all'
      const heroRecords = (await redisClient.client.json.get(
        `${client.token}:heroRecords`,
      )) as Record<string, heroRecords>

      const { win, lose } = heroRecords?.[profile.accountid] || {}
      if (typeof win === 'number' && typeof lose === 'number') {
        return speakHeroStats({
          win,
          lose,
          profile,
          ourHero,
          hero,
          channel,
          allTime,
          lng: message.channel.client.locale,
        })
      }

      try {
        await getHeroMsg({
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
      } catch (e) {
        //
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
  const data = { allTime, heroId: hero.id, steam32Id }

  // TODO: :isPrivate is not actually being set anywhere
  if (ourHero && Number(await redisClient.client.get(`${token}:isPrivate`)) === 1) {
    chatClient.say(channel, t('privateProfile', { command: '!hero', lng }))
    return
  }

  const sockets = await server.io.in(token).fetchSockets()
  if (sockets.length === 0) {
    chatClient.say(channel, t('overlayMissing', { command: '!hero', lng }))
    return
  }

  sockets[0]
    .timeout(15000)
    .emit('requestHeroData', { data }, async (err: any, response: heroRecords) => {
      if (!response) return

      await redisClient.client.json.set(`${token}:heroRecords`, `$.${steam32Id}}`, response)
      speakHeroStats({ ...response, ourHero, profile, hero, channel, allTime, lng })
    })
}
