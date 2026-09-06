import { t } from 'i18next'

import { getHeroWinLoss } from '../../db/get-hero-win-loss'
import { gsiHandlers } from '../../dota/lib/consts'
import { hasCurrentGameContext } from '../../dota/lib/get-current-match-id'
import { getHeroByName, getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'
import { findAccountFromCmd } from '../lib/find-gsi-by-account-id'

const handleNotPlaying = function handleNotPlaying(message: MessageType): void {
  chatClient.say(
    message.channel.name,
    t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
    message.user.messageId
  )
}

const speakHeroStats = function speakHeroStats({
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
}): void {
  const total = (win || 0) + (lose || 0)
  const timeperiod = t('herostats.timeperiod.days', { count: 30, lng })

  if (!total) {
    chatClient.say(
      channel,
      t(hasHero ? 'herostats.noneStreamer' : 'herostats.noneColor', {
        color: heroNameOrColor,
        heroName: heroNameOrColor,
        lng,
        timeperiod,
      }),
      message.user.messageId
    )
    return
  }

  chatClient.say(
    channel,
    t(hasHero ? 'herostats.winrateStreamer' : 'herostats.winrateColor', {
      color: heroNameOrColor,
      count: total,
      heroName: heroNameOrColor,
      lng,
      timeperiod,
      winrate: Math.round(((win || 0) / total) * 100),
    }),
    message.user.messageId
  )
}

const handleRequestedHero = async function handleRequestedHero(
  message: MessageType,
  args: string[]
): Promise<void> {
  const {
    channel: { name: channel, client },
  } = message
  const requestedHero = getHeroByName(args.join(''))
  if (!requestedHero) {
    chatClient.say(channel, t('gameNotFound', { lng: client.locale }), message.user.messageId)
    return
  }

  const records = await getHeroWinLoss({
    heroId: requestedHero.id,
    isStreamer: true,
    steam32Id: client.steam32Id ?? 0,
    token: client.token,
  })
  if (!records) {
    chatClient.say(channel, t('gameNotFound', { lng: client.locale }), message.user.messageId)
    return
  }

  speakHeroStats({
    ...records,
    channel,
    hasHero: true,
    heroNameOrColor: requestedHero.localized_name,
    lng: client.locale,
    message,
  })
}

commandHandler.registerCommand('hero', {
  dbkey: DBSettings.commandHero,
  handler: async (message, args, command) => {
    const { locale } = message.channel.client
    const {
      channel: { name: channel, client },
    } = message

    try {
      if (args.length > 0) {
        await handleRequestedHero(message, args)
        return
      }

      const gsi = gsiHandlers.get(client.token)
      if (!gsi || !hasCurrentGameContext(client)) {
        handleNotPlaying(message)
        return
      }

      const { ourHero, player, hero, playerIdx } = await findAccountFromCmd(
        client,
        args,
        client.locale,
        command
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
        hasHero: hero?.id !== undefined && hero.id !== 0,
        heroNameOrColor: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
        lng: locale,
        message,
      })
    } catch (error) {
      chatClient.say(
        message.channel.name,
        error instanceof Error
          ? error.message
          : t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId
      )
    }
  },
  onlyOnline: true,
})
