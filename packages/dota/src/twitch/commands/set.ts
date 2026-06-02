import { t } from 'i18next'

import { captureCosmetics } from '../../dota/lib/captureCosmetics'
import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('set', {
  aliases: ['cosmetics', 'loadout'],
  onlyOnline: true,
  dbkey: DBSettings.commandSet,
  handler: async (message, _args) => {
    const {
      channel: { name: channel, client },
    } = message
    const locale = client.locale

    const matchId = client.gsi?.map?.matchid
    const heroId = client.gsi?.hero?.id
    if (!matchId || !heroId || heroId <= 0) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: locale }),
        message.user.messageId,
      )
      return
    }

    const heroName = getHeroNameOrColor(heroId)
    // Re-snapshots the loadout (normally already captured automatically on the
    // hero:id event); also gives us the resolved item count for the reply.
    const items = await captureCosmetics(client)

    if (!items.length) {
      chatClient.say(
        channel,
        t('cosmetics.empty', { heroName, lng: locale }),
        message.user.messageId,
      )
      return
    }

    chatClient.say(
      channel,
      t('cosmetics.list', {
        heroName,
        count: items.length,
        url: `dotabod.com/${client.name}/set`,
        lng: locale,
      }),
      message.user.messageId,
    )
  },
})
