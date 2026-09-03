import { steamSocket } from './ws'

export interface SteamPlayerSummary {
  personaName: string | null
  countryCode: string | null
}

interface SteamPlayerSummaryResponse {
  account_id: number
  persona_name: string | null
  country_code: string | null
}

export async function getSteamPlayerSummaries(
  accountIds: number[],
): Promise<Map<number, SteamPlayerSummary>> {
  const uniqueAccountIds = [...new Set(accountIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (!uniqueAccountIds.length) return new Map()

  const response = await new Promise<SteamPlayerSummaryResponse[]>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Steam player summaries timed out')), 10_000)
    steamSocket.emit(
      'getPlayerSummaries',
      uniqueAccountIds,
      (error: string | null, data: SteamPlayerSummaryResponse[] | null | undefined) => {
        clearTimeout(timeout)
        if (error) reject(new Error(error))
        else resolve(data ?? [])
      },
    )
  }).catch(() => [])

  return new Map(
    response.map((summary) => [
      summary.account_id,
      { personaName: summary.persona_name, countryCode: summary.country_code },
    ]),
  )
}
