import { t } from 'i18next'

import { getHeroWinLoss } from '../../db/getHeroWinLoss'
import { gsiHandlers } from '../../dota/lib/consts'
import { getCurrentMatchId } from '../../dota/lib/getCurrentMatchId'
import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

commandHandler.registerCommand('hero', {
  onlyOnline: true,
  dbkey: DBSettings.commandHero,
  handler: async (message, args, command) => {
    const { locale } = message.channel.client
    const {
      channel: { name: channel, client },
    } = message

    const gsi = gsiHandlers.get(client.token)
    if (!gsi || !getCurrentMatchId(client)) return handleNotPlaying(message)

    try {
      const { ourHero, player, hero, playerIdx } = await findAccountFromCmd(
        client,
        args,
        client.locale,
        command,
      )

      const steam32Id = Number(player?.accountid ?? (ourHero ? client.steam32Id : undefined))
      const records = await getHeroWinLoss({
        heroId: hero?.id ?? 0,
        isStreamer:
          ourHero ||
          steam32Id === client.steam32Id ||
          client.SteamAccount.some((account) => account.steam32Id === steam32Id),
        steam32Id,
        token: client.token,
      })
      if (!records) {
        chatClient.say(channel, t('gameNotFound', { lng: locale }), message.user.messageId)
        return
      }

      speakHeroStats({
        ...records,
        channel,
        hasHero: !!hero?.id,
        heroNameOrColor: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        lng: locale,
        message,
      })
      return
    } catch (e) {
      chatClient.say(
        message.channel.name,
        (e as Error)?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
    }
  },
})

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
