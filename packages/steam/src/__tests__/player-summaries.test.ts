import { describe, expect, it, vi } from 'vite-plus/test'
import { SteamPlayerSummaryService } from '../playerSummaries.ts'

describe('SteamPlayerSummaryService', () => {
  it('uses Steam packet names and the Web API only to add country codes', async () => {
    const getPersonas = vi.fn(async () => ({
      personas: {
        '76561197960265851': { player_name: 'Packet Name' },
      },
    }))
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        response: {
          players: [
            {
              steamid: '76561197960265851',
              personaname: 'Web Name',
              loccountrycode: 'se',
            },
          ],
        },
      }),
    }))
    const service = new SteamPlayerSummaryService({
      getPersonas,
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(service.get([123])).resolves.toEqual([
      { account_id: 123, persona_name: 'Packet Name', country_code: 'SE' },
    ])
  })

  it('still returns packet names when no Web API key is configured', async () => {
    const service = new SteamPlayerSummaryService({
      getPersonas: async () => ({
        personas: {
          '76561197960266184': { player_name: 'Private Packet Name' },
        },
      }),
      apiKey: undefined,
    })

    await expect(service.get([456])).resolves.toEqual([
      { account_id: 456, persona_name: 'Private Packet Name', country_code: null },
    ])
  })

  it('reuses cached summaries instead of repeating packet and Web API requests', async () => {
    const getPersonas = vi.fn(async () => ({
      personas: {
        '76561197960266517': { player_name: 'Cached Name' },
      },
    }))
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: { players: [] } }),
    }))
    const service = new SteamPlayerSummaryService({
      getPersonas,
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await service.get([789])
    await service.get([789])

    expect(getPersonas).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
