import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import { findAccountFromCmd } from '../lib/find-gsi-by-account-id'

commandHandler.registerCommand('gpm', {
  dbkey: DBSettings.commandGPM,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message
    try {
      const { player, hero, playerIdx } = await findAccountFromCmd(
        client,
        args,
        client.locale,
        command
      )
      const heroName =
        player && 'gpm' in player
          ? getHeroNameOrColor(hero?.id ?? 0, playerIdx)
          : getHeroNameOrColor(client?.gsi?.hero?.id ?? 0)

      const gpm = player && 'gpm' in player ? player.gpm : client.gsi?.player?.gpm

      if (!gpm) {
        chatClient.say(
          channel,
          t('gpm_zero', { heroName, lng: message.channel.client.locale, num: 0 }),
          message.user.messageId
        )
        return
      }

      const gold_from_hero_kills =
        player && 'gold_from_hero_kills' in player
          ? player.gold_from_hero_kills
          : client.gsi?.player?.gold_from_hero_kills
      const gold_from_creep_kills =
        player && 'gold_from_creep_kills' in player
          ? player.gold_from_creep_kills
          : client.gsi?.player?.gold_from_creep_kills

      chatClient.say(
        channel,
        t('gpm_other', {
          creepKills: gold_from_creep_kills ?? 0,
          heroKills: gold_from_hero_kills ?? 0,
          heroName,
          lng: message.channel.client.locale,
          num: gpm,
        }),
        message.user.messageId
      )
    } catch (error) {
      chatClient.say(
        message.channel.name,
        (error as Error)?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId
      )
    }
  },
  onlyOnline: true,
})
