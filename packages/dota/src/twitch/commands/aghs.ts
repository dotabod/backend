import DOTA_AGHS from 'dotaconstants/build/aghs_desc.json' with { type: 'json' }
import { t } from 'i18next'
import type { GSIHandlerType } from '../../dota/GSIHandlerTypes'
import { gsiHandlers } from '../../dota/lib/consts'
import { getHeroById, getHeroNameOrColor, withHeroLink } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { findAccountFromCmd } from '../lib/findGSIByAccountId'

commandHandler.registerCommand('aghs', {
  onlyOnline: true,
  dbkey: DBSettings.commandAghs,
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
        channelClient,
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
      const heroAghs = DOTA_AGHS.find((agh) => agh.hero_name === heroData?.key)

      if (!heroAghs) {
        chatClient.say(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
          message.user.messageId,
        )
        return
      }

      if (!heroAghs.has_scepter) {
        return chatClient.say(
          channelName,
          withHeroLink(
            t('noAghs', {
              lng: channelClient.locale,
              heroName: getHeroNameOrColor(hero.id, playerIdx),
            }),
            hero.id,
          ),
          message.user.messageId,
        )
      }

      chatClient.say(
        channelName,
        withHeroLink(
          t('aghs', {
            lng: channelClient.locale,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
            title: heroAghs?.scepter_skill_name,
            description: heroAghs?.scepter_desc,
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
