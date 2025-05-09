import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import type { DelayedGames, Packet, Players } from '../../types.js'
import { getSpectatorPlayers } from './getSpectatorPlayers.js'

function getAllPlayers(data: DelayedGames) {
  const players: Players = []
  data.teams.forEach((team) => {
    team.players.forEach((player) => {
      players.push({
        heroid: player.heroid,
        accountid: Number(player.accountid),
        playerid: null,
        // TODO: could get team_slot from here
      })
    })
  })
  return players
}

// Interface for Vision API match response
interface VisionApiMatchHero {
  hero_id: number
  hero_name: string
  hero_localized_name: string
  match_score: number
  position: number
  player_name?: string
  rank?: number
  team: string
  variant: string
}

interface VisionApiMatchPlayer {
  hero: string
  hero_id: number
  player_name?: string
  position: number
  rank?: number
  team: string
}

interface VisionApiMatchResponse {
  match_id: string
  heroes: VisionApiMatchHero[]
  players: VisionApiMatchPlayer[]
  // other fields not needed for our use case
}

export async function getAccountsFromMatch({
  gsi,
  searchMatchId,
  searchPlayers,
}: {
  gsi?: Packet
  searchMatchId?: string
  searchPlayers?: Players
} = {}): Promise<{
  matchPlayers: Players
  accountIds: number[]
}> {
  const players = searchPlayers?.length ? searchPlayers : getSpectatorPlayers(gsi)

  // spectator account ids
  if (Array.isArray(players) && players.length) {
    return {
      matchPlayers: players,
      accountIds: players.map((player) => player.accountid),
    }
  }

  const matchId = searchMatchId || gsi?.map?.matchid

  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    const response = await db
      .collection<DelayedGames>('delayedGames')
      .findOne({ 'match.match_id': matchId })

    const hasTwoTeams = Array.isArray(response?.teams) && response?.teams.length === 2

    // i think this is faster than using response.players (game source tv)
    if (!hasTwoTeams && Array.isArray(response?.teams)) {
      const players = getAllPlayers(response)
      return {
        matchPlayers: players,
        accountIds: players.map((a) => Number(a.accountid)),
      }
    }

    // this probably never gets called now
    if (response?.players?.length && !hasTwoTeams) {
      return {
        matchPlayers: response.players.map((a) => ({
          heroid: a.heroid,
          accountid: Number(a.accountid),
          playerid: null, // Unknown until we have two teams
        })),
        accountIds: response.players.map((a) => Number(a.accountid)),
      }
    }

    if (hasTwoTeams) {
      const matchPlayers = [
        ...response.teams[0].players.map((a) => ({
          heroid:
            a.heroid ||
            response?.players?.find((p) => Number(p.accountid) === Number(a.accountid))?.heroid,
          accountid: Number(a.accountid),
          playerid: a.playerid,
        })),
        ...response.teams[1].players.map((a) => ({
          heroid:
            a.heroid ||
            response?.players?.find((p) => Number(p.accountid) === Number(a.accountid))?.heroid,
          accountid: Number(a.accountid),
          playerid: a.playerid,
        })),
      ]
      return {
        matchPlayers,
        accountIds: matchPlayers.map((player) => player.accountid),
      }
    }

    if (matchId && process.env.VISION_API_HOST) {
      try {
        const apiUrl = `https://${process.env.VISION_API_HOST}/match/${matchId}`
        const apiResponse = await fetch(apiUrl, {
          headers: {
            'X-API-Key': process.env.VISION_API_KEY || '',
          },
        })

        if (apiResponse.ok) {
          const data = (await apiResponse.json()) as VisionApiMatchResponse

          if (!Array.isArray(data.heroes) || data.heroes.length === 0) {
            return {
              matchPlayers: [],
              accountIds: [],
            }
          }

          // Convert Vision API response to our player format
          const matchPlayers: Players = data.heroes.map((hero) => ({
            heroid: hero.hero_id,
            rank: hero.rank,
            player_name: hero.hero_id === gsi?.hero?.id ? gsi?.player?.name : hero.player_name,
            accountid: hero.hero_id === gsi?.hero?.id ? Number(gsi?.player?.accountid) : 0, // Vision API doesn't provide account IDs
            playerid: hero.hero_id === gsi?.hero?.id ? Number(gsi?.player?.id) : null,
          }))

          return {
            matchPlayers,
            accountIds: matchPlayers.map((player) => player.accountid).filter((id) => id !== 0),
          }
        }
      } catch (error) {
        // Silent fail - if Vision API fails, we'll fall back to default return
        console.error('Failed to fetch from Vision API:', error)
      }
    }
  } finally {
    await mongo.close()
  }

  return {
    matchPlayers: [
      {
        heroid: gsi?.hero?.id,
        accountid: Number(gsi?.player?.accountid),
        playerid: null,
      },
    ],
    accountIds: [Number(gsi?.player?.accountid)],
  }
}
