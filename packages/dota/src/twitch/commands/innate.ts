import DOTA_ABILITIES from 'dotaconstants/build/abilities.json' assert { type: 'json' }
import DOTA_HERO_ABILITIES from 'dotaconstants/build/hero_abilities.json' assert { type: 'json' }
import { t } from 'i18next'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getHeroById, getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

commandHandler.registerCommand('innate', {
  dbkey: DBSettings.commandInnate,
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
        sendMessage(channelName, t('gameNotFound', { lng: channelClient.locale }))
        return
      }

      const heroData = getHeroById(hero.id)
      const heroInnate = getHeroInnate(heroData)

      if (!heroInnate) {
        sendMessage(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
        )
        return
      }

      sendMessage(
        channelName,
        t('innate', {
          lng: channelClient.locale,
          heroName: getHeroNameOrColor(hero.id, playerIdx),
          title: heroInnate.title,
          description: heroInnate.description,
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

const getHeroInnate = (
  heroData: ReturnType<typeof getHeroById>,
): { title: string; description: string } | undefined => {
  const abilities =
    DOTA_HERO_ABILITIES?.[heroData?.key as keyof typeof DOTA_HERO_ABILITIES]?.abilities
  console.log({ heroData, abilities })
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

const sendMessage = (channelName: string, message: string) => {
  chatClient.say(channelName, message)
}
