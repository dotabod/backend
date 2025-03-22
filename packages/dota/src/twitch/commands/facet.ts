import DOTA_HERO_ABILITIES from 'dotaconstants/build/hero_abilities.json' assert { type: 'json' }
import { t } from 'i18next'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getHeroById, getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('facet', {
  onlyOnline: true,
  dbkey: DBSettings.commandFacet,
  handler: async (message, args, command) => {
    const {
      channel: { name: channelName, client: channelClient },
    } = message

    const gsiHandler = gsiHandlers.get(channelClient.token)

    if (!isValidGSIHandler(gsiHandler, channelClient.gsi?.map?.matchid)) {
      chatClient.say(
        channelName,
        t('notPlaying', { emote: 'PauseChamp', lng: channelClient.locale }),
        message.user.messageId,
      )
      return
    }

    try {
      const { hero, playerIdx } = await findAccountFromCmd(
        channelClient.gsi,
        args,
        channelClient.locale,
        command,
      )
      if (!isValidHero(hero) || !hero) {
        chatClient.say(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
          message.user.messageId,
        )
        return
      }

      const heroData = getHeroById(hero.id)
      const requestedFacet = Number(args[args.length - 1]) || hero.facet
      const heroFacet = getHeroFacet(heroData, requestedFacet || hero.facet)
      const totalFacets = getFacetCount(heroData)

      if (!totalFacets) {
        chatClient.say(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
          message.user.messageId,
        )
        return
      }

      if (requestedFacet && totalFacets < requestedFacet) {
        chatClient.say(
          channelName,
          t('facetTotalLimit', {
            lng: channelClient.locale,
            count: totalFacets,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
          }),
          message.user.messageId,
        )
        return
      }

      if (!heroFacet) {
        chatClient.say(
          channelName,
          t('facetNotFound', {
            lng: channelClient.locale,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
          }),
          message.user.messageId,
        )
        return
      }

      if (hero.facet && (!requestedFacet || hero.facet === requestedFacet)) {
        chatClient.say(
          channelName,
          t('facetSelection', {
            lng: channelClient.locale,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
            facetTitle: heroFacet.title,
            facetDescription: heroFacet.description,
          }),
          message.user.messageId,
        )
        return
      }

      chatClient.say(
        channelName,
        t('facet', {
          lng: channelClient.locale,
          heroName: getHeroNameOrColor(hero.id, playerIdx),
          facetTitle: heroFacet.title,
          facetDescription: heroFacet.description,
          number: requestedFacet || hero.facet,
        }),
        message.user.messageId,
      )
    } catch (error: any) {
      chatClient.say(
        channelName,
        error.message ?? t('gameNotFound', { lng: channelClient.locale }),
        message.user.messageId,
      )
    }
  },
})

const isValidGSIHandler = (gsiHandler: any, matchId: any): boolean => {
  return !!gsiHandler && !!matchId
}

const isValidHero = (hero: any): boolean => {
  return typeof hero?.id === 'number' && !!getHeroById(hero.id)
}

const getFacetCount = (heroData: ReturnType<typeof getHeroById>) => {
  return (
    DOTA_HERO_ABILITIES?.[heroData?.key as keyof typeof DOTA_HERO_ABILITIES]?.facets?.length || null
  )
}

const getHeroFacet = (
  heroData: ReturnType<typeof getHeroById>,
  facetIndex: number,
): { title: string; description: string } | null => {
  return DOTA_HERO_ABILITIES?.[heroData?.key as keyof typeof DOTA_HERO_ABILITIES]?.facets[
    facetIndex - 1
  ]
}
