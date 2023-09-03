import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'
import { findAccountFromCmd } from './findGSIByAccountId.js'

commandHandler.registerCommand('xpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandXPM,
  handler: async (message: MessageType, args: string[], command) => {
    const {
      channel: { name: channel, client },
    } = message

    const { player, playerIdx, hero } = await findAccountFromCmd(
      client.gsi,
      args,
      client.locale,
      command,
    )
    const heroName = getHeroNameOrColor(hero?.id ?? 0, playerIdx)
    const xpm = player?.xpm ?? 0
    chatClient.say(channel, t('xpm', { heroName, lng: client.locale, num: xpm }))
  },
})
