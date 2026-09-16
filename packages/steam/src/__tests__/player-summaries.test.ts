import { once } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { SteamPlayerSummaryService } from '../player-summaries.ts'

interface WebPlayerFixture {
  loccountrycode?: number | string
  personaname?: string
  steamid: string
}

type CacheInfo = (
  message: string,
  metadata: {
    cacheSize: number
    capacityEvictions: number
    expiredEvictions: number
    hits: number
    maxEntries: number
    misses: number
  }
) => void

const completed = Promise.resolve()

const createFetch = function createFetch(players: WebPlayerFixture[]): typeof fetch {
  return async () => {
    await completed
    return Response.json({ response: { players } })
  }
}

describe(SteamPlayerSummaryService, () => {
  it('keeps valid country codes when another Web API player is malformed', async () => {
    const service = new SteamPlayerSummaryService({
      apiKey: 'test-key',
      fetchImpl: createFetch([
        {
          loccountrycode: 7,
          personaname: 'Malformed Web Name',
          steamid: '76561197960265851',
        },
        {
          loccountrycode: 'se',
          personaname: 'Valid Web Name',
          steamid: '76561197960266184',
        },
      ]),
      getPersonas: async () => {
        await completed
        return {
          personas: {
            '76561197960265851': { player_name: 'First Packet Name' },
            '76561197960266184': { player_name: 'Second Packet Name' },
          },
        }
      },
    })

    await expect(service.get([123, 456])).resolves.toStrictEqual([
      { account_id: 123, country_code: null, persona_name: 'First Packet Name' },
      { account_id: 456, country_code: 'SE', persona_name: 'Second Packet Name' },
    ])
  })

  it('uses Steam packet names and the Web API only to add country codes', async () => {
    const service = new SteamPlayerSummaryService({
      apiKey: 'test-key',
      fetchImpl: createFetch([
        {
          loccountrycode: 'se',
          personaname: 'Web Name',
          steamid: '76561197960265851',
        },
      ]),
      getPersonas: async () => {
        await completed
        return {
          personas: {
            '76561197960265851': { player_name: 'Packet Name' },
          },
        }
      },
    })

    await expect(service.get([123])).resolves.toStrictEqual([
      { account_id: 123, country_code: 'SE', persona_name: 'Packet Name' },
    ])
  })

  it('still returns packet names when no Web API key is configured', async () => {
    const service = new SteamPlayerSummaryService({
      getPersonas: async () => {
        await completed
        return {
          personas: {
            '76561197960266184': { player_name: 'Private Packet Name' },
          },
        }
      },
    })

    await expect(service.get([456])).resolves.toStrictEqual([
      { account_id: 456, country_code: null, persona_name: 'Private Packet Name' },
    ])
  })

  it('reuses cached summaries instead of repeating packet and Web API requests', async () => {
    let personaRequests = 0
    let webRequests = 0
    const fetchImpl: typeof fetch = async () => {
      await completed
      webRequests += 1
      return Response.json({ response: { players: [] } })
    }
    const service = new SteamPlayerSummaryService({
      apiKey: 'test-key',
      fetchImpl,
      getPersonas: async () => {
        await completed
        personaRequests += 1
        return {
          personas: {
            '76561197960266517': { player_name: 'Cached Name' },
          },
        }
      },
    })

    await service.get([789])
    await service.get([789])

    expect({ personaRequests, webRequests }).toStrictEqual({ personaRequests: 1, webRequests: 1 })
  })

  it('starts the cache TTL after an asynchronous Steam lookup completes', async () => {
    let now = 0
    let personaRequests = 0
    const service = new SteamPlayerSummaryService({
      getPersonas: async () => {
        personaRequests += 1
        now = 10 * 60 * 1000 + 1
        await completed
        return {
          personas: { '76561197960265851': { player_name: 'Slow Response' } },
        }
      },
      now: () => now,
    })

    await service.get([123])
    await service.get([123])

    expect(personaRequests).toBe(1)
  })

  it('preserves expiry order when overlapping lookups finish out of order', async () => {
    let now = 0
    let requestNumber = 0
    const gates = new EventTarget()
    const info = vi.fn<CacheInfo>()
    const service = new SteamPlayerSummaryService({
      getPersonas: async () => {
        requestNumber += 1
        const currentRequest = requestNumber
        await (currentRequest <= 2 ? once(gates, `request-${currentRequest}`) : completed)
        return { personas: {} }
      },
      logger: { info },
      now: () => now,
    })

    const olderLookup = service.get([123])
    const newerLookup = service.get([123])
    now = 100
    gates.dispatchEvent(new Event('request-2'))
    await newerLookup

    now = 200
    await service.get([456])

    now = 300
    gates.dispatchEvent(new Event('request-1'))
    await olderLookup

    now = 10 * 60 * 1000 + 250
    await service.get([789])

    expect(info).toHaveBeenCalledExactlyOnceWith('[STEAM] Player summary cache stats', {
      cacheSize: 2,
      capacityEvictions: 0,
      expiredEvictions: 1,
      hits: 0,
      maxEntries: 5000,
      misses: 4,
    })
  })

  it('removes expired entries even when those accounts are not requested again', async () => {
    let now = 0
    const info = vi.fn<CacheInfo>()
    const service = new SteamPlayerSummaryService({
      getPersonas: async () => {
        await completed
        return { personas: {} }
      },
      logger: { info },
      now: () => now,
    })

    await service.get([123, 456])
    now = 10 * 60 * 1000 + 1
    await service.get([789])

    expect(info).toHaveBeenCalledExactlyOnceWith('[STEAM] Player summary cache stats', {
      cacheSize: 1,
      capacityEvictions: 0,
      expiredEvictions: 2,
      hits: 0,
      maxEntries: 5000,
      misses: 3,
    })
  })

  it('evicts the oldest summary after reaching the cache limit', async () => {
    const requestedBatchSizes: number[] = []
    const service = new SteamPlayerSummaryService({
      getPersonas: async (steamIds) => {
        await completed
        requestedBatchSizes.push(steamIds.length)
        return { personas: {} }
      },
    })
    const initialAccounts = Array.from({ length: 5000 }, (_, index) => index + 1)

    await service.get(initialAccounts)
    await service.get([5001])
    const summaries = await service.get([1, 2])

    expect(requestedBatchSizes).toStrictEqual([5000, 1, 1])
    expect(summaries.map((summary) => summary.account_id)).toStrictEqual([1, 2])
  })
})
