import { t } from 'i18next'

import { DBSettings } from '@dotabod/settings'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('gpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandGPM,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!client.gsi?.hero?.name) {
      chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }

    const gpm = client.gsi.player?.gpm

    if (!gpm) {
      chatClient.say(channel, t('gpm_zero', { num: 0, lng: message.channel.client.locale }))
      return
    }

    const gold_from_hero_kills = client.gsi.player?.gold_from_hero_kills
    const gold_from_creep_kills = client.gsi.player?.gold_from_creep_kills

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
