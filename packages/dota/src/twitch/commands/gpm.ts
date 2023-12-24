import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('gpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandGPM,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message
    try {
      const { player, hero, playerIdx } = await findAccountFromCmd(
        client.gsi,
        args,
        client.locale,
        command,
      )
      const heroName = player?.gpm
        ? getHeroNameOrColor(hero?.id ?? 0, playerIdx)
        : getHeroNameOrColor(client?.gsi?.hero?.id ?? 0)

      const gpm = player?.gpm ?? client.gsi?.player?.gpm

      if (!gpm) {
        chatClient.say(
          channel,
          t('gpm_zero', { heroName, num: 0, lng: message.channel.client.locale }),
        )
        return
      }

      const gold_from_hero_kills = player?.gold_from_hero_kills
      const gold_from_creep_kills = player?.gold_from_creep_kills

      chatClient.say(
        channel,
        t('gpm_other', {
          heroName,
          num: gpm,
          lng: message.channel.client.locale,
          heroKills: gold_from_hero_kills ?? 0,
          creepKills: gold_from_creep_kills ?? 0,
        }),
      )
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
      )
    }
  },
})
