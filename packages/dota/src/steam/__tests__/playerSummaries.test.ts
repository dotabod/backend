import { describe, expect, it, vi } from 'vitest'

const { emit } = vi.hoisted(() => ({
  emit: vi.fn(
    (
      event: string,
      accountIds: number[],
      callback: (
        error: string | null,
        summaries: {
          account_id: number
          persona_name: string | null
          country_code: string | null
        }[]
      ) => void
    ) => {
      if (event !== 'getPlayerSummaries') {
        throw new Error(`Unexpected event: ${event}`)
      }
      callback(
        null,
        accountIds.map((accountId) => ({
          account_id: accountId,
          country_code: accountId === 123 ? 'SE' : null,
          persona_name: `Player ${accountId}`,
        }))
      )
    }
  ),
}))

vi.mock(import('../ws.ts'), () => ({ steamSocket: { emit } }))

import { getSteamPlayerSummaries } from '../playerSummaries.ts'

describe(getSteamPlayerSummaries, () => {
  it('maps Steam-service RPC results by account ID', async () => {
    await expect(getSteamPlayerSummaries([123, 456])).resolves.toStrictEqual(
      new Map([
        [123, { countryCode: 'SE', personaName: 'Player 123' }],
        [456, { countryCode: null, personaName: 'Player 456' }],
      ])
    )
  })
})
