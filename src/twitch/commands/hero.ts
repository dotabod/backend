import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import getHero from '../../dota/lib/getHero.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import axios from '../../utils/axios.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('hero', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!getValueOrDefault(DBSettings.commandHero, client.settings)) {
      return
    }
    if (!client.steam32Id || !client.gsi??.hero?.name || !isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, 'Not playing PauseChamp')
      return
    }

    const hero = getHero(client.gsi.hero.name)

    if (!hero) {
      void chatClient.say(channel, "Couldn't find hero Sadge")
      return
    }

    axios(
      `https://api.opendota.com/api/players/${client.steam32Id}/wl/?hero_id=${hero.id}&having=1&date=30`,
    )
      .then(({ data }: { data: { win: number; lose: number } }) => {
        if (data.win + data.lose === 0) {
          void chatClient.say(channel, `No matches played as ${hero.localized_name} in 30d.`)
          return
        }

        // Divide by zero error
        if (data.win === 0 && data.lose > 0) {
          void chatClient.say(
            channel,
            `Winrate: 0% as ${hero.localized_name} in 30d of ${data.lose} matches.`,
          )
          return
        }

        const winrate = Math.round((data.win / (data.win + data.lose)) * 100)
        void chatClient.say(
          channel,
          `Winrate: ${winrate}% as ${hero.localized_name} in 30d of ${
            data.lose + data.win
          } matches.`,
        )
      })
      .catch((e) => {
        void chatClient.say(channel, `Playing ${hero.localized_name}`)
        console.log(e)
      })
  },
})
