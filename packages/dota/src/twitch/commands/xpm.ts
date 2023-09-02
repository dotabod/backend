import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import getHero from '../../dota/lib/getHero.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'
import { findGSIByAccountId } from './findGSIByAccountId.js'

commandHandler.registerCommand('xpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandXPM,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const myHero = getHero(client.gsi?.hero?.name)
    const spectatorPlayers = getCurrentMatchPlayers(client.gsi)
    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })
    const selectedPlayer = spectatorPlayers.find((a) => a.selected)

    if (!myHero) {
      if (!selectedPlayer && !matchPlayers.length) {
        chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
        return
      }
    }

    if (!selectedPlayer && !matchPlayers.length && !myHero) {
      chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }

    const specPlayer = findGSIByAccountId(client.gsi, selectedPlayer?.accountid)
    const player = client.gsi?.player || specPlayer.player

    const xpm = player?.xpm ?? 0
    chatClient.say(channel, t('xpm', { lng: client.locale, num: xpm }))
    return
  },
})
