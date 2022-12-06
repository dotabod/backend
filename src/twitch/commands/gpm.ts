import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('gpm', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    if (!getValueOrDefault(DBSettings.commandGPM, message.channel.client.settings)) {
      return
    }

    if (!message.channel.client.gsi) return
    if (!isPlayingMatch(message.channel.client.gsi)) return

    const gpm = message.channel.client.gsi.gamestate?.player?.gpm

    if (!gpm) {
      void chatClient.say(message.channel.name, 'Live GPM: 0')
      return
    }

    const gold_from_hero_kills = message.channel.client.gsi.gamestate?.player?.gold_from_hero_kills
    const gold_from_creep_kills =
      message.channel.client.gsi.gamestate?.player?.gold_from_creep_kills

    void chatClient.say(
      message.channel.name,
      `Live GPM: ${gpm}. ${gold_from_hero_kills ?? 0} from hero kills, ${
        gold_from_creep_kills ?? 0
      } from creep kills.`,
    )
  },
})
