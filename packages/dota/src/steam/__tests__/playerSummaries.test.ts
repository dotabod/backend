import { describe, expect, it, vi } from 'vite-plus/test'

const { emit } = vi.hoisted(() => ({
  emit: vi.fn(
    (
      event: string,
      accountIds: number[],
      callback: (
        error: string | null,
        summaries: Array<{
          account_id: number
          persona_name: string | null
          country_code: string | null
        }>,
      ) => void,
    ) => {
      if (event !== 'getPlayerSummaries') throw new Error(`Unexpected event: ${event}`)
      callback(
        null,
        accountIds.map((accountId) => ({
          account_id: accountId,
          persona_name: `Player ${accountId}`,
          country_code: accountId === 123 ? 'SE' : null,
        })),
      )
    },
  ),
}))

vi.mock('../ws.ts', () => ({ steamSocket: { emit } }))

import { getSteamPlayerSummaries } from '../playerSummaries.ts'

describe('getSteamPlayerSummaries', () => {
  it('maps Steam-service RPC results by account ID', async () => {
    await expect(getSteamPlayerSummaries([123, 456])).resolves.toEqual(
      new Map([
        [123, { personaName: 'Player 123', countryCode: 'SE' }],
        [456, { personaName: 'Player 456', countryCode: null }],
      ]),
    )
  })
})
