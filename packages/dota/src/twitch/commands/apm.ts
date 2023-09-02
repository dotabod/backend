import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import getHero from '../../dota/lib/getHero.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'
import { findGSIByAccountId } from './findGSIByAccountId.js'

commandHandler.registerCommand('apm', {
  onlyOnline: true,
  dbkey: DBSettings.commandAPM,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    const hero = getHero(client.gsi?.hero?.name)
    const spectatorPlayers = getCurrentMatchPlayers(client.gsi)
    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })
    const selectedPlayer = spectatorPlayers.find((a) => a.selected)

    if (!hero) {
      if (!selectedPlayer && !matchPlayers.length) {
        chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
        return
      }
    }

    if (!selectedPlayer || !matchPlayers.length) {
      chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }

    const { player } = findGSIByAccountId(client.gsi, selectedPlayer.accountid)
    const commandsIssued = player?.commands_issued ?? 0
    const gameTime = client.gsi?.map?.game_time ?? 1
    const apm = commandsIssued ? Math.round(commandsIssued / (gameTime / 60)) : 0

    chatClient.say(
      channel,
      t('apm', { emote: 'Chatting', lng: message.channel.client.locale, count: apm }),
    )
    return
  },
})
