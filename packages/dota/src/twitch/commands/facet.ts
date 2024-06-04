import DOTA_HERO_ABILITIES from 'dotaconstants/build/hero_abilities.json' assert { type: 'json' }
import { t } from 'i18next'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('facet', {
  dbkey: DBSettings.commandFacet,
  handler: async (message, args, command) => {
    const {
      channel: { name: channel, client },
    } = message

    const gsi = gsiHandlers.get(client.token)

    if (!gsi || !client.gsi?.map?.matchid) {
      chatClient.say(
        message.channel.name,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }

    try {
      const { hero, playerIdx } = await findAccountFromCmd(client.gsi, args, client.locale, command)
      if (typeof hero?.id !== 'number') {
        chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
        return
      }

      const facet =
        DOTA_HERO_ABILITIES?.[hero.name as keyof typeof DOTA_HERO_ABILITIES]?.facets[hero.facet - 1]

      if (!facet) {
        chatClient.say(
          channel,
          t('facetNotFound', {
            lng: message.channel.client.locale,
            heroName: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
          }),
        )
        return
      }

      chatClient.say(
        channel,
        t('facet', {
          lng: message.channel.client.locale,
          heroName: getHeroNameOrColor(hero?.id ?? 0, playerIdx),
          facetTitle: facet.title,
          facetDescription: facet.description,
        }),
      )
      return
    } catch (e: any) {
      chatClient.say(
        message.channel.name,
        e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
      )
    }
  },
})
