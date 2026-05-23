import { t } from 'i18next'

import { redisClient } from '../../../db/redisInstance'
import { type BountyRunePickupEvent, DotaEventTypes } from '../../../types'
import { is8500Plus } from '../../../utils/index'
import { delayedQueue } from '../../lib/DelayedQueue'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { say } from '../../say'
import eventHandler from '../EventHandler'

eventHandler.registerEvent(`event:${DotaEventTypes.BountyPickup}`, {
  handler: async (dotaClient, event: BountyRunePickupEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return
    // Only announce bounty rune pickups during the initial spawn window (first 2 minutes).
    // Bounty runes also respawn periodically, but we only track the opening contest.
    if (Number(dotaClient.client.gsi?.map?.clock_time) > 120) return

    const playingTeam =
      (await redisClient.client.get(`${dotaClient.client.token}:playingTeam`)) ??
      dotaClient.client.gsi?.player?.team_name

    if (event.team !== playingTeam) return

    const { matchPlayers } = await getAccountsFromMatch({
      gsi: dotaClient.client.gsi,
    })

    if (typeof event.player_id !== 'number') return

    const foundIndex = matchPlayers.findIndex((p) => p.playerid === event.player_id)
    const playerIdIndex = foundIndex === -1 ? event.player_id : foundIndex
    const heroid = matchPlayers[playerIdIndex]?.heroid
    const high = is8500Plus(dotaClient.client)

    // No heroid (sub-8500 rosterSize-1 fallback for a non-streamer slot) → skip.
    // 8500+ unmatched → raw event.player_id is unreliable (reshuffle), skip rather
    // than guess a wrong hero in chat. See event.aegis_picked_up for the pattern.
    if (typeof heroid !== 'number' || (high && foundIndex === -1)) return

    if (dotaClient.bountyTaskId) {
      delayedQueue.removeTask(dotaClient.bountyTaskId)
    }
    const heroName = getHeroNameOrColor(heroid, playerIdIndex)

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
        }
        if (index === array.length - 1) {
          return `${acc}, and ${heroName}`
        }
        return `${acc}, ${heroName}`
      })

    dotaClient.bountyTaskId = delayedQueue.addTask(15000, () => {
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
        { chattersKey: 'bounties' },
      )
      dotaClient.bountyHeroNames = []
    })
  },
})
