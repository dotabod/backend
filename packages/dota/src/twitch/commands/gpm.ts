import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import getHero from '../../dota/lib/getHero.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'
import { findGSIByAccountId } from './findGSIByAccountId.js'

commandHandler.registerCommand('gpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandGPM,
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
    const gpm = player?.gpm ?? client.gsi?.player?.gpm

    if (!gpm) {
      chatClient.say(channel, t('gpm_zero', { num: 0, lng: message.channel.client.locale }))
      return
    }

    const gold_from_hero_kills = player?.gold_from_hero_kills
    const gold_from_creep_kills = player?.gold_from_creep_kills

    chatClient.say(
      channel,
      t('gpm_other', {
        num: gpm,
        lng: message.channel.client.locale,
        heroKills: gold_from_hero_kills ?? 0,
        creepKills: gold_from_creep_kills ?? 0,
      }),
    )
  },
})
