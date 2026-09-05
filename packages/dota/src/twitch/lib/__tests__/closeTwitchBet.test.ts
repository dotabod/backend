import { beforeEach, describe, expect, it } from 'vitest'

import { DBSettings } from '../../../settings'
import type { SocketClient } from '../../../types'
import { closeTwitchBet, PRO_SUB, resetState, state } from './setupMocks'

describe(closeTwitchBet, () => {
  const mockTwitchId = '123456789'
  const mockMatchId = 'match-123'
  const mockPredictionId = 'pred-456'

  beforeEach(() => {
    resetState()
  })

  it('should resolve prediction normally when discardZeroBets is disabled', async () => {
    state.predictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 10, title: 'Yes' },
          { id: 'outcome-2', users: 0, title: 'No' },
        ],
        status: 'ACTIVE',
      },
    ]

    const settings: SocketClient['settings'] = [{ key: DBSettings.discardZeroBets, value: false }]

    await closeTwitchBet(true, mockTwitchId, mockMatchId, settings, PRO_SUB)

    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'outcome-1', predictionId: mockPredictionId, twitchId: mockTwitchId },
    ])
    expect(state.cancelPredictionCalls).toHaveLength(0)
  })

  it('should refund prediction when discardZeroBets is enabled and winning side has zero users', async () => {
    state.predictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 0, title: 'Yes' },
          { id: 'outcome-2', users: 5, title: 'No' },
        ],
        status: 'ACTIVE',
      },
    ]

    const settings: SocketClient['settings'] = [{ key: DBSettings.discardZeroBets, value: true }]

    await closeTwitchBet(true, mockTwitchId, mockMatchId, settings, PRO_SUB)

    expect(state.cancelPredictionCalls).toStrictEqual([
      { predictionId: mockPredictionId, twitchId: mockTwitchId },
    ])
    expect(state.resolvePredictionCalls).toHaveLength(0)
    expect(state.loggerInfoCalls).toContainEqual({
      message: '[PREDICT] [BETS] Refunding prediction - zero predictions on one side',
      meta: expect.objectContaining({
        lossOutcomeUsers: 5,
        matchId: mockMatchId,
        twitchId: mockTwitchId,
        wonOutcomeUsers: 0,
      }),
    })
  })

  it('should refund prediction when discardZeroBets is enabled and losing side has zero users', async () => {
    state.predictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 8, title: 'Yes' },
          { id: 'outcome-2', users: 0, title: 'No' },
        ],
        status: 'ACTIVE',
      },
    ]

    const settings: SocketClient['settings'] = [{ key: DBSettings.discardZeroBets, value: true }]

    await closeTwitchBet(false, mockTwitchId, mockMatchId, settings, PRO_SUB)

    expect(state.cancelPredictionCalls).toStrictEqual([
      { predictionId: mockPredictionId, twitchId: mockTwitchId },
    ])
    expect(state.resolvePredictionCalls).toHaveLength(0)
  })

  it('should resolve prediction normally when both sides have users even if discardZeroBets is enabled', async () => {
    state.predictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 10, title: 'Yes' },
          { id: 'outcome-2', users: 5, title: 'No' },
        ],
        status: 'ACTIVE',
      },
    ]

    const settings: SocketClient['settings'] = [{ key: DBSettings.discardZeroBets, value: true }]

    await closeTwitchBet(true, mockTwitchId, mockMatchId, settings, PRO_SUB)

    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'outcome-1', predictionId: mockPredictionId, twitchId: mockTwitchId },
    ])
    expect(state.cancelPredictionCalls).toHaveLength(0)
  })

  it('should resolve prediction normally when discardZeroBets setting is not provided (default false)', async () => {
    state.predictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 10, title: 'Yes' },
          { id: 'outcome-2', users: 0, title: 'No' },
        ],
        status: 'ACTIVE',
      },
    ]

    await closeTwitchBet(true, mockTwitchId, mockMatchId)

    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'outcome-1', predictionId: mockPredictionId, twitchId: mockTwitchId },
    ])
    expect(state.cancelPredictionCalls).toHaveLength(0)
  })

  it('should handle case with no predictions found', async () => {
    state.predictions = []

    await closeTwitchBet(true, mockTwitchId, mockMatchId)

    expect(state.resolvePredictionCalls).toHaveLength(0)
    expect(state.cancelPredictionCalls).toHaveLength(0)
    expect(state.loggerInfoCalls).toContainEqual({
      message: '[PREDICT] Close bets - no predictions found',
      meta: expect.any(Object),
    })
  })

  it('should retry getPredictions on a transient ERR_STREAM_PREMATURE_CLOSE and still resolve', async () => {
    state.predictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 10, title: 'Yes' },
          { id: 'outcome-2', users: 5, title: 'No' },
        ],
        status: 'ACTIVE',
      },
    ]
    // Fail twice (the two retries), succeed on the third attempt.
    state.getPredictionsTransientFailures = 2

    await closeTwitchBet(true, mockTwitchId, mockMatchId)

    expect(state.getPredictionsCalls).toHaveLength(3)
    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'outcome-1', predictionId: mockPredictionId, twitchId: mockTwitchId },
    ])
    // The blip was absorbed by the retry, so no error was surfaced.
    expect(state.loggerErrorCalls).toHaveLength(0)
  })
})
