import { describe, expect, it } from 'vitest'

import { SteamPlayerSummaryService } from '../player-summaries.ts'

interface WebPlayerFixture {
  loccountrycode?: number | string
  personaname?: string
  steamid: string
}

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
})
