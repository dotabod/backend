import DOTA_ABILITIES from 'dotaconstants/build/abilities.json' with { type: 'json' }
import DOTA_HERO_ABILITIES from 'dotaconstants/build/hero_abilities.json' with { type: 'json' }
import { t } from 'i18next'
import type { GSIHandlerType } from '../../dota/GSIHandlerTypes'
import { gsiHandlers } from '../../dota/lib/consts'
import { getHeroById, getHeroNameOrColor, withHeroLink } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

commandHandler.registerCommand('innate', {
  onlyOnline: true,
  dbkey: DBSettings.commandInnate,
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
          t('gameNotFound', { lng: channelClient.locale }),
          message.user.messageId,
        )
        return
      }

      const heroData = getHeroById(hero.id)
      const heroInnate = getHeroInnate(heroData)

      if (!heroInnate) {
        chatClient.say(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
          message.user.messageId,
        )
        return
      }

      chatClient.say(
        channelName,
        withHeroLink(
          t('innate', {
            lng: channelClient.locale,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
            title: heroInnate.title,
            description: heroInnate.description,
          }),
          hero.id,
        ),
        message.user.messageId,
      )
    } catch (error) {
      chatClient.say(
        channelName,
        (error as Error).message ?? t('gameNotFound', { lng: channelClient.locale }),
        message.user.messageId,
      )
    }
  },
})

const isValidGSIHandler = (
  gsiHandler: GSIHandlerType | undefined,
  matchId: string | undefined,
): boolean => {
  return !!gsiHandler && !!matchId
}

const isValidHero = (hero: { id?: number } | null | undefined): boolean => {
  return typeof hero?.id === 'number' && !!getHeroById(hero.id)
}

const getHeroInnate = (
  heroData: ReturnType<typeof getHeroById>,
): { title: string; description: string } | undefined => {
  const abilities =
    DOTA_HERO_ABILITIES?.[heroData?.key as keyof typeof DOTA_HERO_ABILITIES]?.abilities
  for (const ability of abilities) {
    const abilityData = DOTA_ABILITIES[ability as keyof typeof DOTA_ABILITIES]
    if (
      'is_innate' in abilityData &&
      'dname' in abilityData &&
      'desc' in abilityData &&
      abilityData.is_innate === true
    ) {
      return {
        title: abilityData.dname,
        description: abilityData.desc,
      }
    }
  }
}
