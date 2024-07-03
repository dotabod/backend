import DOTA_HERO_ABILITIES from 'dotaconstants/build/hero_abilities.json' assert { type: 'json' }
import { t } from 'i18next'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getHeroById, getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('facet', {
  dbkey: DBSettings.commandFacet,
  handler: async (message, args, command) => {
    const {
      channel: { name: channelName, client: channelClient },
    } = message

    const gsiHandler = gsiHandlers.get(channelClient.token)

    if (!isValidGSIHandler(gsiHandler, channelClient.gsi?.map?.matchid)) {
      sendMessage(channelName, t('notPlaying', { emote: 'PauseChamp', lng: channelClient.locale }))
      return
    }

    try {
      const { hero, playerIdx } = await findAccountFromCmd(
        channelClient.gsi,
        args,
        channelClient.locale,
        command,
      )
      if (!isValidHero(hero)) {
        sendMessage(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
        )
        return
      }

      const heroData = getHeroById(hero.id)
      const requestedFacet = Number(args[args.length - 1]) || hero.facet
      const heroFacet = getHeroFacet(heroData, requestedFacet || hero.facet)
      const totalFacets = getFacetCount(heroData)

      if (!totalFacets) {
        sendMessage(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
        )
        return
      }

      if (requestedFacet && totalFacets < requestedFacet) {
        sendMessage(
          channelName,
          t('facetTotalLimit', {
            lng: channelClient.locale,
            count: totalFacets,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
          }),
        )
        return
      }

      if (!heroFacet) {
        sendMessage(
          channelName,
          t('facetNotFound', {
            lng: channelClient.locale,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
          }),
        )
        return
      }

      if (hero.facet && (!requestedFacet || hero.facet === requestedFacet)) {
        sendMessage(
          channelName,
          t('facetSelection', {
            lng: channelClient.locale,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
            facetTitle: heroFacet.title,
            facetDescription: heroFacet.description,
          }),
        )
        return
      }

      sendMessage(
        channelName,
        t('facet', {
          lng: channelClient.locale,
          heroName: getHeroNameOrColor(hero.id, playerIdx),
          facetTitle: heroFacet.title,
          facetDescription: heroFacet.description,
          number: requestedFacet || hero.facet,
        }),
      )
    } catch (error: any) {
      sendMessage(channelName, error.message ?? t('gameNotFound', { lng: channelClient.locale }))
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

const sendMessage = (channelName: string, message: string) => {
  chatClient.say(channelName, message)
}
