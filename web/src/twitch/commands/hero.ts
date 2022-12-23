import { DBSettings } from '../../db/settings.js'
import getHero from '../../dota/lib/getHero.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import axios from '../../utils/axios.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('hero', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  onlyOnline: true,
  dbkey: DBSettings.commandHero,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.steam32Id) {
      void chatClient.say(channel, 'No steam32Id found')
      return
    }
    if (!client.gsi?.hero?.name) {
      void chatClient.say(channel, 'No hero found')
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, 'Not playing PauseChamp')
      return
    }

    const hero = getHero(client.gsi.hero.name)

    if (!hero) {
      void chatClient.say(channel, "Couldn't find hero Sadge")
      return
    }

    const allTime = args[0] === 'all'

    axios(
      `https://api.opendota.com/api/players/${client.steam32Id}/wl/?hero_id=${hero.id}&having=1${
        allTime ? '' : '&date=30'
      }`,
    )
      .then(({ data }: { data: { win: number; lose: number } }) => {
        const wl = data.win + data.lose
        const winrate = !wl ? 0 : Math.round((data.win / wl) * 100)
        const timePeriod = allTime ? 'in lifetime' : 'in 30d'

        if (wl > 0) {
          void chatClient.say(
            channel,
            `Winrate: ${winrate}% as ${hero.localized_name} ${timePeriod} of ${wl} matches.`,
          )
          return
        }

        if (!wl) {
          void chatClient.say(channel, `No matches played as ${hero.localized_name} ${timePeriod}.`)
          return
        }
      })
      .catch((e) => {
        void chatClient.say(channel, `Playing ${hero.localized_name}`)
        console.log(e?.data, 'could not find wl, weirdge')
      })
  },
})
