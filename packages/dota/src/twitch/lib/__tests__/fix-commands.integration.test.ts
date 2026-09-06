import { beforeEach, describe, expect, it } from 'vitest'

import { createPacketStub } from '../../../__tests__/shared-mocks.ts'
// setupMocks MUST be imported before any dota source modules — its top-level
// `vi.doMock('@dotabod/shared-utils', …)` only applies to imports that evaluate
// after it. Statically importing `getWL` or `fixdbl` ahead of this line would
// resolve shared-utils to the real module and cache it, breaking the mock.
import { commandHandler, makeMessage, resetState, state } from './setup-mocks.ts'

const { t } = await import('i18next')
const { MULTIPLIER_PARTY, MULTIPLIER_SOLO } = await import('../../../db/get-wl.ts')
const { toggleDoubledownMmr } = await import('../../commands/fixdbl.ts')

interface RecentMatch {
  hero_name: string | null
  id: string
  is_doubledown: boolean
  is_party: boolean
  matchId: string
  won: boolean
}

const lastMatch = (overrides: Partial<RecentMatch> = {}): RecentMatch[] => [
  {
    hero_name: null,
    id: 'row-1',
    is_doubledown: false,
    is_party: false,
    matchId: '7777777777',
    won: true,
    ...overrides,
  },
]

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe(toggleDoubledownMmr, () => {
  it('removes the gain when a win was already counted as a doubledown', () => {
    expect(
      toggleDoubledownMmr({
        currentMmr: 3000,
        didWin: true,
        isParty: false,
        wasDoubledown: true,
      })
    ).toBe(3000 - MULTIPLIER_SOLO)
  })

  it('adds the party multiplier when toggling a party match the other way', () => {
    expect(
      toggleDoubledownMmr({
        currentMmr: 3000,
        didWin: true,
        isParty: true,
        wasDoubledown: false,
      })
    ).toBe(3000 + MULTIPLIER_PARTY)
  })
})

describe('!fixparty', () => {
  it('reports noLastMatch when there is no resolved match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!fixparty' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('noLastMatch', { emote: 'PauseChamp', lng: 'en' }))
    expect(state.updateMmrCalls).toHaveLength(0)
  })

  it('toggles party, adjusts mmr, and persists is_party', async () => {
    state.recentList = lastMatch({ is_party: false })
    await commandHandler.handleMessage(makeMessage({ content: '!fixparty' }))

    expect(state.chatSayCalls[0].message).toBe(
      t('toggleMatch', {
        context: 'party',
        lng: 'en',
        url: 'dotabod.com/streamer/matches',
      })
    )
    // togglePartyMmr: solo->party half-delta (PARTY/2=10), was solo so +delta,
    // but a win subtracts it -> 5000 - 10 (client mmr defaults to 5000).
    expect(state.updateMmrCalls).toHaveLength(1)
    expect(state.updateMmrCalls[0]).toMatchObject({
      newMmr: 5000 - MULTIPLIER_PARTY / 2,
    })
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({ is_party: true })
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!fixparty', permission: 0, userName: 'viewer' })
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })

  it('keeps the first-party match-history link for 8500+ clients', async () => {
    state.recentList = lastMatch({ is_party: false })
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { mmr: 9000 }, content: '!fixparty' })
    )
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer/matches')
  })
})

describe('!fixdbl', () => {
  it('toggles doubledown, adjusts mmr, and persists is_doubledown', async () => {
    state.recentList = lastMatch({ is_doubledown: false })
    await commandHandler.handleMessage(makeMessage({ content: '!fixdbl' }))

    expect(state.chatSayCalls[0].message).toBe(
      t('toggleMatch', {
        context: 'double',
        lng: 'en',
        url: 'dotabod.com/streamer/matches',
      })
    )
    // solo win newly marked doubledown -> +MULTIPLIER_SOLO (5000 + 25).
    expect(state.updateMmrCalls).toHaveLength(1)
    expect(state.updateMmrCalls[0]).toMatchObject({
      newMmr: 5000 + MULTIPLIER_SOLO,
    })
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({ is_doubledown: true })
  })

  it('keeps the first-party match-history link for 8500+ clients', async () => {
    state.recentList = lastMatch({ is_doubledown: false })
    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { mmr: 9000 }, content: '!fixdbl' })
    )
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer/matches')
  })
})

describe('!winprobability', () => {
  it('reports gameNotFound when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!winprobability' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('gameNotFound', { lng: 'en' }))
  })

  it('reports the Valve-disabled message for a live match (proto disabled)', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        clientOverrides: {
          gsi: createPacketStub({ map: { matchid: '7777777777' } }),
        },
        content: '!winprobability',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('matchDataValveDisabled', { lng: 'en' }))
  })

  it('blocks when the stream is offline', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        clientOverrides: { stream_online: false },
        content: '!winprobability',
      })
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('notLive', { emote: 'PauseChamp', lng: 'en' }))
  })
})

describe('!unresolved', () => {
  it('reports no unresolved matches when there are none', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!unresolved' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('bets.noUnresolvedMatches', { emote: 'Okayeg', lng: 'en' })
    )
  })

  it('lists unresolved match ids with hero names', async () => {
    state.recentList = [
      {
        created_at: '2026-05-22T11:00:00.000Z',
        dire_score: 20,
        hero_name: 'npc_dota_hero_antimage',
        kda: { assists: 8, deaths: 2, duration: 1800, kills: 10 },
        matchId: '123',
        radiant_score: 30,
        updated_at: '2026-05-22T11:30:00.000Z',
        won: false,
      },
    ]
    await commandHandler.handleMessage(makeMessage({ content: '!unresolved' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('123')
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!unresolved',
        permission: 0,
        userName: 'viewer',
      })
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})
