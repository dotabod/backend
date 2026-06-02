import { type Json, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { resolveCosmetics } from '../../dota/lib/cosmetics'
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
    const items = resolveCosmetics(client.gsi?.wearables)

    if (!items.length) {
      chatClient.say(
        channel,
        t('cosmetics.empty', { heroName, lng: locale }),
        message.user.messageId,
      )
      return
    }

    // Snapshot the resolved loadout so dotabod.com/<name>/set can render it
    // later — cosmetics don't change mid-match, so a point-in-time capture is fine.
    await supabase.from('cosmetic_loadouts').upsert(
      {
        userId: client.token,
        matchId: String(matchId),
        heroId,
        heroName,
        items: items as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'userId' },
    )

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
