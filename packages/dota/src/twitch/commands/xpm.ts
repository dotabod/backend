import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

commandHandler.registerCommand('xpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandXPM,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message

    try {
      const { player, playerIdx, hero } = await findAccountFromCmd(
        client.gsi,
        args,
        client.locale,
        command,
      )
      const heroName =
        player && 'xpm' in player
          ? getHeroNameOrColor(hero?.id ?? 0, playerIdx)
          : getHeroNameOrColor(client?.gsi?.hero?.id ?? 0)
      const xpm = player && 'xpm' in player ? player.xpm : (client.gsi?.player?.xpm ?? 0)
      chatClient.say(
        channel,
        t('xpm', { heroName, lng: client.locale, num: xpm }),
        message.user.messageId,
      )
    } catch (e) {
      chatClient.say(
        message.channel.name,
        (e as Error)?.message ?? t('gameNotFound', { lng: client.locale }),
        message.user.messageId,
      )
    }
  },
})
