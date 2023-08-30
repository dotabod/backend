import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { GSIHandler, redisClient } from '../../GSIHandler.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`event:${DotaEventTypes.BountyPickup}`, {
  handler: async (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return
    if (Number(dotaClient.client.gsi?.map?.clock_time) > 120) return

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      bounties: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)
    if (!chattersEnabled || !chatterEnabled) return

    const playingTeam =
      (await redisClient.client.get(`${dotaClient.client.token}:playingTeam`)) ??
      dotaClient.client.gsi?.player?.team_name

    if (event.team !== playingTeam) return

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    if (
      typeof matchPlayers[event.player_id]?.heroid !== 'number' ||
      typeof event.player_id !== 'number'
    )
      return

    clearTimeout(dotaClient.bountyTimeout)
    const heroName = getHeroNameById(matchPlayers[event.player_id]?.heroid, event.player_id)

    dotaClient.bountyHeroNames.push(heroName)

    // there could be multiple hero names in bountyHeroNames, so aggregate them and write `2x heroName` for example
    // if only 1 then dont write the number, just write `heroName`
    const bountyHeroNames = dotaClient.bountyHeroNames.reduce<Record<string, number>>(
      (acc, cur) => {
        if (acc[cur]) {
          acc[cur]++
        } else {
          acc[cur] = 1
        }
        return acc
      },
      {},
    )

    const bountyHeroNamesString = Object.keys(bountyHeroNames)
      .map((heroName) => {
        const count = bountyHeroNames[heroName]
        return count > 1 ? `${count}x ${heroName}` : heroName
      })
      .reduce((acc, heroName, index, array) => {
        if (array.length === 2 && index === 1) {
          return `${acc} and ${heroName}`
        } else if (index === array.length - 1) {
          return `${acc}, and ${heroName}`
        } else {
          return `${acc}, ${heroName}`
        }
      })

    dotaClient.bountyTimeout = setTimeout(() => {
      say(
        dotaClient.client,
        t('bounties.pickup', {
          emote: 'EZ Clap',
          emote2: 'SeemsGood',
          lng: dotaClient.client.locale,
          bountyValue: event.bounty_value * dotaClient.bountyHeroNames.length,
          totalBounties: dotaClient.bountyHeroNames.length,
          heroNames: bountyHeroNamesString,
        }),
      )
      dotaClient.bountyHeroNames = []
    }, 15000)
  },
})
