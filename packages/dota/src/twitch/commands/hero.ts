import { t } from 'i18next'

import { server } from '../../dota/index.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('hero', {
  onlyOnline: true,
  dbkey: DBSettings.commandHero,
  handler: async (message, args, command) => {
    const { locale } = message.channel.client
    const {
      channel: { name: channel, client },
    } = message

    const gsi = gsiHandlers.get(client.token)
    if (!gsi || !client.gsi?.map?.matchid) return handleNotPlaying(message)

    try {
      const { player, hero, playerIdx } = await findAccountFromCmd(
        client.gsi,
        args,
        client.locale,
        command,
      )

      await getHeroMsg({
        heroId: hero?.id ?? 0,
        channel,
        hasHero: !!hero?.id,
        heroNameOrColor: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        steam32Id: player.accountid,
        token: client.token,
        lng: locale,
        message,
      })
      return
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
    }
  },
})

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
    message.user.messageId,
  )
}

function speakHeroStats({
  heroNameOrColor,
  hasHero,
  win,
  lose,
  channel,
  lng,
  message,
}: {
  hasHero: boolean
  heroNameOrColor?: string
  lng: string
  lose: number
  channel: string
  win: number
  message: MessageType
}) {
  const total = (win || 0) + (lose || 0)
  const timeperiod = t('herostats.timeperiod.days', { count: 30, lng })

  if (!total) {
    chatClient.say(
      channel,
      t(hasHero ? 'herostats.noneStreamer' : 'herostats.noneColor', {
        lng,
        heroName: heroNameOrColor,
        timeperiod,
        color: heroNameOrColor,
      }),
      message.user.messageId,
    )
    return
  }

  chatClient.say(
    channel,
    t(hasHero ? 'herostats.winrateStreamer' : 'herostats.winrateColor', {
      lng,
      heroName: heroNameOrColor,
      winrate: Math.round(((win || 0) / total) * 100),
      timeperiod,
      count: total,
      color: heroNameOrColor,
    }),
    message.user.messageId,
  )
}

async function getHeroMsg({
  channel,
  steam32Id,
  heroNameOrColor,
  token,
  hasHero,
  lng,
  heroId,
  message,
}: {
  heroNameOrColor: string
  hasHero: boolean
  channel: string
  heroId: number
  steam32Id: number
  token: string
  lng: string
  message: MessageType
}) {
  const sockets = await server.io.in(token).fetchSockets()
  if (sockets.length === 0) {
    chatClient.say(channel, t('overlayMissing', { command: '!hero', lng }), message.user.messageId)
    return
  }

  sockets[0]
    .timeout(15000)
    .emit(
      'requestHeroData',
      { allTime: false, heroId, steam32Id },
      (err: any, response: heroRecords) => {
        if (!response) return

        const { win, lose } = response
        speakHeroStats({ win, lose, hasHero, heroNameOrColor, channel, lng, message })
      },
    )
}
