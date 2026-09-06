import DOTA_ABILITIES from 'dotaconstants/build/abilities.json' with { type: 'json' }
import DOTA_HERO_ABILITIES from 'dotaconstants/build/hero_abilities.json' with { type: 'json' }
import { t } from 'i18next'
import { z } from 'zod'

import type { GSIHandlerType } from '../../dota/gsi-handler-types'
import { gsiHandlers } from '../../dota/lib/consts'
import { hasCurrentGameContext } from '../../dota/lib/get-current-match-id'
import { getHeroById, getHeroNameOrColor, withHeroLink } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import { findAccountFromCmd } from '../lib/find-gsi-by-account-id'

type LookupHero = Awaited<ReturnType<typeof findAccountFromCmd>>['hero']

const heroIdSchema = z.object({ id: z.number() })
const heroAbilitiesSchema = z.record(z.string(), z.object({ abilities: z.array(z.string()) }))
const abilityDetailsSchema = z.record(
  z.string(),
  z.object({
    desc: z.string().optional(),
    dname: z.string().optional(),
    is_innate: z.boolean().optional(),
  })
)

const heroAbilities = heroAbilitiesSchema.parse(DOTA_HERO_ABILITIES)
const abilityDetails = abilityDetailsSchema.parse(DOTA_ABILITIES)

const isValidGSIHandler = function isValidGSIHandler(
  gsiHandler: GSIHandlerType | undefined,
  hasCurrentGame: boolean
): boolean {
  return gsiHandler !== undefined && hasCurrentGame
}

const getValidHeroId = function getValidHeroId(hero: LookupHero): number | null {
  const parsedHero = heroIdSchema.safeParse(hero)
  if (!parsedHero.success || !getHeroById(parsedHero.data.id)) {
    return null
  }
  return parsedHero.data.id
}

const getHeroInnate = function getHeroInnate(
  heroData: ReturnType<typeof getHeroById>
): { description: string; title: string } | undefined {
  if (!heroData) {
    return undefined
  }

  const abilities = heroAbilities[heroData.key]?.abilities ?? []
  for (const ability of abilities) {
    const details = abilityDetails[ability]
    if (details?.is_innate === true && details.dname !== undefined && details.desc !== undefined) {
      return {
        description: details.desc,
        title: details.dname,
      }
    }
  }
  return undefined
}

commandHandler.registerCommand('innate', {
  dbkey: DBSettings.commandInnate,
  handler: async (message, args, command) => {
    const {
      channel: { name: channelName, client: channelClient },
    } = message

    const gsiHandler = gsiHandlers.get(channelClient.token)

    if (!isValidGSIHandler(gsiHandler, hasCurrentGameContext(channelClient))) {
      chatClient.say(
        channelName,
        t('notPlaying', { emote: 'PauseChamp', lng: channelClient.locale }),
        message.user.messageId
      )
      return
    }

    try {
      const { hero, playerIdx } = await findAccountFromCmd(
        channelClient,
        args,
        channelClient.locale,
        command
      )
      const heroId = getValidHeroId(hero)
      if (heroId === null) {
        chatClient.say(
          channelName,
          t('gameNotFound', { lng: channelClient.locale }),
          message.user.messageId
        )
        return
      }

      const heroData = getHeroById(heroId)
      const heroInnate = getHeroInnate(heroData)

      if (!heroInnate) {
        chatClient.say(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
          message.user.messageId
        )
        return
      }

      chatClient.say(
        channelName,
        withHeroLink(
          t('innate', {
            description: heroInnate.description,
            heroName: getHeroNameOrColor(heroId, playerIdx),
            lng: channelClient.locale,
            title: heroInnate.title,
          }),
          heroId
        ),
        message.user.messageId
      )
    } catch (error) {
      chatClient.say(
        channelName,
        error instanceof Error ? error.message : t('gameNotFound', { lng: channelClient.locale }),
        message.user.messageId
      )
    }
  },
  onlyOnline: true,
})
