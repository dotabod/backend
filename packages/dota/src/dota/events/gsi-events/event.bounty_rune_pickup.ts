import { t } from 'i18next'

import { redisClient } from '../../../db/redis-instance'
import { DotaEventTypes } from '../../../types'
import type { BountyRunePickupEvent } from '../../../types'
import { is8500Plus } from '../../../utils/index'
import { delayedQueue } from '../../lib/delayed-queue'
import { getHeroNameOrColor } from '../../lib/heroes'
import { isPlayingMatch } from '../../lib/is-playing-match'
import { MatchDataService } from '../../lib/matchData'
import { say } from '../../say'
import eventHandler from '../event-handler'

eventHandler.registerEvent(`event:${DotaEventTypes.BountyPickup}`, {
  handler: async (dotaClient, event: BountyRunePickupEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) {
      return
    }
    if (!dotaClient.client.stream_online) {
      return
    }
    // Only announce bounty rune pickups during the initial spawn window (first 2 minutes).
    // Bounty runes also respawn periodically, but we only track the opening contest.
    if (Number(dotaClient.client.gsi?.map?.clock_time) > 120) {
      return
    }

    const playingTeam =
      (await redisClient.client.get(`${dotaClient.client.token}:playingTeam`)) ??
      dotaClient.client.gsi?.player?.team_name

    if (event.team !== playingTeam) {
      return
    }

    if (typeof event.player_id !== 'number') {
      return
    }

    const roster = await new MatchDataService(dotaClient.client).resolveRoster()
    const { players } = roster

    const foundIndex = players.findIndex((p) => p.slot === event.player_id)
    const playerIdIndex = foundIndex === -1 ? event.player_id : foundIndex
    const heroId = players[playerIdIndex]?.heroId
    const high = is8500Plus(dotaClient.client)

    // No heroId (sub-8500 rosterSize-1 fallback for a non-streamer slot) → skip.
    // 8500+ unmatched → raw event.player_id is unreliable (reshuffle), skip rather
    // than guess a wrong hero in chat. See event.aegis_picked_up for the pattern.
    if (typeof heroId !== 'number' || (high && foundIndex === -1)) {
      return
    }

    if (dotaClient.bountyTaskId) {
      delayedQueue.removeTask(dotaClient.bountyTaskId)
    }
    const heroName = getHeroNameOrColor(heroId, playerIdIndex)

    dotaClient.bountyHeroNames.push(heroName)

    // there could be multiple hero names in bountyHeroNames, so aggregate them and write `2x heroName` for example
    // if only 1 then dont write the number, just write `heroName`
    const bountyHeroNames = dotaClient.bountyHeroNames.reduce<Record<string, number>>(
      (acc, cur) => {
        if (acc[cur]) {
          acc[cur] += 1
        } else {
          acc[cur] = 1
        }
        return acc
      },
      {}
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

    dotaClient.bountyTaskId = delayedQueue.addTask(15_000, () => {
      say(
        dotaClient.client,
        t('bounties.pickup', {
          bountyValue: event.bounty_value * dotaClient.bountyHeroNames.length,
          emote: 'EZ Clap',
          emote2: 'SeemsGood',
          heroNames: bountyHeroNamesString,
          lng: dotaClient.client.locale,
          totalBounties: dotaClient.bountyHeroNames.length,
        }),
        { chattersKey: 'bounties' }
      )
      dotaClient.bountyHeroNames = []
    })
  },
})
