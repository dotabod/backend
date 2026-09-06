import DOTA_AGHS from 'dotaconstants/build/aghs_desc.json' with { type: 'json' }
import { t } from 'i18next'

import type { GSIHandlerType } from '../../dota/gsi-handler-types'
import { gsiHandlers } from '../../dota/lib/consts'
import { hasCurrentGameContext } from '../../dota/lib/get-current-match-id'
import { getHeroById, getHeroNameOrColor, withHeroLink } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import { findAccountFromCmd } from '../lib/find-gsi-by-account-id'

commandHandler.registerCommand('aghs', {
  dbkey: DBSettings.commandAghs,
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
      if (!isValidHero(hero) || !hero) {
        chatClient.say(
          channelName,
          t('gameNotFound', { lng: channelClient.locale }),
          message.user.messageId
        )
        return
      }

      const heroData = getHeroById(hero.id)
      const heroAghs = DOTA_AGHS.find((agh) => agh.hero_name === heroData?.key)

      if (!heroAghs) {
        chatClient.say(
          channelName,
          t('missingMatchData', { emote: 'PauseChamp', lng: channelClient.locale }),
          message.user.messageId
        )
        return
      }

      if (!heroAghs.has_scepter) {
        chatClient.say(
          channelName,
          withHeroLink(
            t('noAghs', {
              heroName: getHeroNameOrColor(hero.id, playerIdx),
              lng: channelClient.locale,
            }),
            hero.id
          ),
          message.user.messageId
        )
        return
      }

      chatClient.say(
        channelName,
        withHeroLink(
          t('aghs', {
            description: heroAghs?.scepter_desc,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
            lng: channelClient.locale,
            title: heroAghs?.scepter_skill_name,
          }),
          hero.id
        ),
        message.user.messageId
      )
    } catch (error) {
      chatClient.say(
        channelName,
        (error as Error).message ?? t('gameNotFound', { lng: channelClient.locale }),
        message.user.messageId
      )
    }
  },
  onlyOnline: true,
})

const isValidGSIHandler = (
  gsiHandler: GSIHandlerType | undefined,
  hasCurrentGame: boolean
): boolean => !!gsiHandler && hasCurrentGame

const isValidHero = (hero: { id?: number } | null | undefined): boolean =>
  typeof hero?.id === 'number' && !!getHeroById(hero.id)
