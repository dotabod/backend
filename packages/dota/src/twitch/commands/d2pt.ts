import { DBSettings } from '@dotabod/settings'
import axios from 'axios'
import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import getHero from '../../dota/lib/getHero.js'
import { getHeroNameById } from '../../dota/lib/heroes.js'
import { isArcade } from '../../dota/lib/isArcade.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('d2pt', {
  aliases: ['dota2pt', 'build', 'builds', 'getbuild'],
  onlyOnline: true,
  dbkey: DBSettings.commandBuilds,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.steam32Id) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    if (isArcade(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }

    const hero = getHero(client.gsi?.hero?.name)
    const spectatorPlayers = getCurrentMatchPlayers(client.gsi)
    const myPlayers = gsiHandlers.get(client.token)?.players?.matchPlayers
    const selectedPlayer = spectatorPlayers.find((a) => a.selected)
    const selectedPlayerIdx = spectatorPlayers.findIndex((a) => a.selected)

    // if its 0-4 its radiant, if its 5-9 its dire
    const isRadiant = selectedPlayerIdx < 5

    if (!hero) {
      if (!selectedPlayer && !myPlayers) {
        chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
        return
      }
    }

    const [position] = args
    if (!args.length || !Number(position) || Number(position) > 5 || Number(position) < 1) {
      chatClient.say(channel, 'missing position, try !d2pt 1-5, eg !d2pt 2 for mid')
      return
    }

    // take first 5 object keys only if radiant, or last 5 if dire
    const players = (
      gsiHandlers.get(client.token)?.players?.matchPlayers || getCurrentMatchPlayers(client.gsi)
    ).slice(isRadiant ? 5 : 0, !isRadiant ? 10 : 5)

    const draft = players.map((a) => a.heroid).join(',') || '' // list of hero ids on enemy team
    const heroId = `${hero ? hero.id : selectedPlayer?.heroid ?? 0}`
    const url = `http://65.108.208.220:8888/itemizer?heroId=${heroId}&position=${position}&draft=${draft}&token=${process
      .env.D2PT_TOKEN!}`

    const heroName = hero ? hero.localized_name : getHeroNameById(selectedPlayer?.heroid ?? 0)

    axios
      .get(url)
      .then((response) => {
        chatClient.say(channel, response.data?.items.join(', ') || 'No items found')
        chatClient.say(
          channel,
          t('dota2pt', {
            heroName,
            url: `dota2protracker.com/hero/${encodeURI(heroName).replace(/'/g, '%27')}`,
            lng: message.channel.client.locale,
          }),
        )
      })
      .catch((e) => {
        console.log(e?.data, e?.response?.data)
      })
  },
})
