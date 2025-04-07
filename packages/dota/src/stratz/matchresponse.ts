import { logger } from '@dotabod/shared-utils'
import axios from 'axios'
import type { HeroNames } from '../dota/lib/getHero.js'

// Credits to Stratz for the GraphQL query for live match details
// They do awesome work and you should check them out at https://stratz.com/
const STRATZ_GQL = 'https://api.stratz.com/graphql'

/*
Example response:

{
  "data": {
    "match": {
      "didRadiantWin": true,
      "gameMode": "ALL_PICK_RANKED",
      "lobbyType": "RANKED",
      "players": [
        {
          "playerSlot": 0,
          "isRadiant": true,
          "kills": 3,
          "deaths": 2,
          "assists": 5,
          "hero": {
            "id": 99,
            "name": "npc_dota_hero_bristleback"
          }
        }
      ],
      "radiantKills": [
        0,
        0,
        3,
        0,
        0,
        1,
        1,
        2,
        3,
        0,
        1,
        4,
        0,
        0,
        0
      ],
      "direKills": [
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        2,
        0,
        0,
        1,
        0,
        0,
        0
      ]
    }
  }
}
*/

const LiveMatchDetailsQuery = `
  query match($matchId: Long!, $steamAccountId: Long!) {
    match(id: $matchId) {
      didRadiantWin
      gameMode
      id
      lobbyType
      players(steamAccountId: $steamAccountId) {
        playerSlot
        isRadiant
        kills
        deaths
        assists
        hero {
          id
          name
        }
      }
      radiantKills
      direKills
    }
  }
`

export type StratzMatchResponse = {
  data: {
    match: {
      id: number
      didRadiantWin: boolean
      gameMode:
        | 'NONE'
        | 'ALL_PICK'
        | 'CAPTAINS_MODE'
        | 'RANDOM_DRAFT'
        | 'SINGLE_DRAFT'
        | 'ALL_RANDOM'
        | 'INTRO'
        | 'THE_DIRETIDE'
        | 'REVERSE_CAPTAINS_MODE'
        | 'THE_GREEVILING'
        | 'TUTORIAL'
        | 'MID_ONLY'
        | 'LEAST_PLAYED'
        | 'NEW_PLAYER_POOL'
        | 'COMPENDIUM_MATCHMAKING'
        | 'CUSTOM'
        | 'CAPTAINS_DRAFT'
        | 'BALANCED_DRAFT'
        | 'ABILITY_DRAFT'
        | 'EVENT'
        | 'ALL_RANDOM_DEATH_MATCH'
        | 'SOLO_MID'
        | 'ALL_PICK_RANKED'
        | 'TURBO'
        | 'MUTATION'
        | 'UNKNOWN'
      lobbyType:
        | 'UNRANKED'
        | 'PRACTICE'
        | 'TOURNAMENT'
        | 'TUTORIAL'
        | 'COOP_VS_BOTS'
        | 'TEAM_MATCH'
        | 'SOLO_QUEUE'
        | 'RANKED'
        | 'SOLO_MID'
        | 'BATTLE_CUP'
        | 'EVENT'
        | 'DIRE_TIDE'
      players: Array<{
        playerSlot: number
        isRadiant: boolean
        kills: number
        deaths: number
        assists: number
        hero: {
          id: number
          name: HeroNames
        }
      }>
      radiantKills: Array<number>
      direKills: Array<number>
    }
  }
}

export const getMatchResponse = async (
  matchId: number,
  steamAccountId: number,
): Promise<StratzMatchResponse['data']['match'] | { error: string }> => {
  if (!process.env.STRATZ_TOKEN) {
    logger.error('STRATZ_TOKEN is not set')
    return { error: 'STRATZ_TOKEN is not set' }
  }

  try {
    const response = await axios.post<StratzMatchResponse>(
      STRATZ_GQL,
      {
        query: LiveMatchDetailsQuery,
        variables: { matchId, steamAccountId },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STRATZ_TOKEN}`,
          'User-Agent': 'STRATZ_API',
        },
      },
    )

    const matchData = response.data?.data?.match
    if (!matchData) {
      return { error: 'No match data found' }
    }

    return matchData
  } catch (error) {
    logger.error('Error fetching live match details', { error })
    return { error: 'Error fetching live match details' }
  }
}
