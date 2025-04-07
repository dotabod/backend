import DOTA_AGHS from 'dotaconstants/build/aghs_desc.json' with { type: 'json' }
import { t } from 'i18next'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getHeroById, getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'
import { findAccountFromCmd } from '../lib/findGSIByAccountId.js'

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
          t('noAghs', {
            lng: channelClient.locale,
            heroName: getHeroNameOrColor(hero.id, playerIdx),
          }),
          message.user.messageId,
        )
      }

      chatClient.say(
        channelName,
        t('aghs', {
          lng: channelClient.locale,
          heroName: getHeroNameOrColor(hero.id, playerIdx),
          title: heroAghs?.scepter_skill_name,
          description: heroAghs?.scepter_desc,
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
