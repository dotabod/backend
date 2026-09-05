import { describe, expect, it, vi } from 'vitest'

import { SteamPlayerSummaryService } from '../playerSummaries.ts'

describe(SteamPlayerSummaryService, () => {
  it('uses Steam packet names and the Web API only to add country codes', async () => {
    const getPersonas = vi.fn(async () => ({
      personas: {
        '76561197960265851': { player_name: 'Packet Name' },
      },
    }))
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({
        response: {
          players: [
            {
              loccountrycode: 'se',
              personaname: 'Web Name',
              steamid: '76561197960265851',
            },
          ],
        },
      }),
      ok: true,
    }))
    const service = new SteamPlayerSummaryService({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getPersonas,
    })

    await expect(service.get([123])).resolves.toStrictEqual([
      { account_id: 123, country_code: 'SE', persona_name: 'Packet Name' },
    ])
  })

  it('still returns packet names when no Web API key is configured', async () => {
    const service = new SteamPlayerSummaryService({
      apiKey: undefined,
      getPersonas: async () => ({
        personas: {
          '76561197960266184': { player_name: 'Private Packet Name' },
        },
      }),
    })

    await expect(service.get([456])).resolves.toStrictEqual([
      { account_id: 456, country_code: null, persona_name: 'Private Packet Name' },
    ])
  })

  it('reuses cached summaries instead of repeating packet and Web API requests', async () => {
    const getPersonas = vi.fn(async () => ({
      personas: {
        '76561197960266517': { player_name: 'Cached Name' },
      },
    }))
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ response: { players: [] } }),
      ok: true,
    }))
    const service = new SteamPlayerSummaryService({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getPersonas,
    })

    await service.get([789])
    await service.get([789])

    expect(getPersonas).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
