import DOTA_HERO_ABILITIES from 'dotaconstants/build/hero_abilities.json' with { type: 'json' }
import { t } from 'i18next'
import { gsiHandlers } from '../../dota/lib/consts'
import { getHeroById, getHeroNameOrColor, withHeroLink } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

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
      const facets = getFacets(heroData)
      const totalFacets = facets.length
      const heroName = getHeroNameOrColor(hero.id, playerIdx)

      if (!totalFacets) {
        chatClient.say(
          channelName,
          withHeroLink(
            t('facetTotalLimit', { lng: channelClient.locale, count: 0, heroName }),
            hero.id,
          ),
          message.user.messageId,
        )
        return
      }

      // GSI never reliably reports the selected facet, so we can't show "their"
      // facet. A numeric arg looks up that facet; otherwise list them all.
      const requestedFacet = Number(args[args.length - 1])
      if (Number.isInteger(requestedFacet) && requestedFacet >= 1) {
        if (requestedFacet > totalFacets) {
          chatClient.say(
            channelName,
            withHeroLink(
              t('facetTotalLimit', { lng: channelClient.locale, count: totalFacets, heroName }),
              hero.id,
            ),
            message.user.messageId,
          )
          return
        }

        const facet = facets[requestedFacet - 1]
        chatClient.say(
          channelName,
          withHeroLink(
            t('facet', {
              lng: channelClient.locale,
              heroName,
              facetTitle: facet.title,
              facetDescription: facet.description,
              number: requestedFacet,
            }),
            hero.id,
          ),
          message.user.messageId,
        )
        return
      }

      const list = facets.map((facet, index) => `${index + 1}: ${facet.title}`).join(' · ')
      chatClient.say(
        channelName,
        withHeroLink(t('facetList', { lng: channelClient.locale, heroName, list }), hero.id),
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

// dotaconstants flags every facet `deprecated`, including current in-game ones,
// so we cannot filter on it — return the hero's full facet list as-is.
const getFacets = (heroData: ReturnType<typeof getHeroById>) =>
  DOTA_HERO_ABILITIES?.[heroData?.key as keyof typeof DOTA_HERO_ABILITIES]?.facets ?? []
