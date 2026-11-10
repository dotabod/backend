import { z } from 'zod'

import { requestSteam } from '../../steam/request'
import { DotaGcTeam } from '../../types'
import type { MatchClosingDetailsResponse } from '../../types'

const matchPlayerSchema = z.object({
  account_id: z.number(),
  assists: z.number(),
  deaths: z.number(),
  hero_id: z.number(),
  kills: z.number(),
  player_slot: z.number(),
  team_number: z.enum(DotaGcTeam),
})

const matchMinimalSchema = z.object({
  dire_score: z.number(),
  match_id: z.object({
    high: z.number(),
    low: z.number(),
    unsigned: z.boolean(),
  }),
  players: z.array(matchPlayerSchema),
  radiant_score: z.number(),
})

const matchMinimalDetailsResponseSchema = z.object({
  matches: z.array(matchMinimalSchema),
})

export const getSteamMatchDetails = async function getSteamMatchDetails(
  matchId: string
): Promise<MatchClosingDetailsResponse> {
  const { matches } = await requestSteam(
    'getMatchMinimalDetails',
    [{ match_id: Number(matchId) }],
    matchMinimalDetailsResponseSchema,
    15_000
  )
  return { matches }
}
