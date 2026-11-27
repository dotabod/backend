import { beforeEach, describe, expect, it } from 'vitest'

import { DBSettings } from '../../../settings'
import { closeTwitchBetById, PRO_SUB, resetState, state } from './setup-mocks'

describe(closeTwitchBetById, () => {
  beforeEach(() => {
    resetState()
    state.predictions = [
      {
        id: 'prediction-1',
        outcomes: [
          { id: 'win', title: 'Yes', users: 0 },
          { id: 'loss', title: 'No', users: 5 },
        ],
        status: 'LOCKED',
      },
    ]
  })

  it.each([
    [0, 5, true],
    [5, 0, false],
    [0, 0, true],
  ])('refunds empty outcomes (%i/%i users, won=%s)', async (winUsers, lossUsers, won) => {
    state.predictions[0].outcomes[0].users = winUsers
    state.predictions[0].outcomes[1].users = lossUsers

    const closed = await closeTwitchBetById(won, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [{ key: DBSettings.discardZeroBets, value: true }],
      subscription: PRO_SUB,
    })

    expect(closed).toBeTruthy()
    expect(state.cancelPredictionCalls).toStrictEqual([
      { predictionId: 'prediction-1', twitchId: 'twitch-1' },
    ])
    expect(state.resolvePredictionCalls).toHaveLength(0)
  })

  it.each([
    { enabled: false, subscription: PRO_SUB },
    { enabled: true, subscription: { ...PRO_SUB, tier: 'FREE' as const } },
    { enabled: true, subscription: { ...PRO_SUB, status: 'CANCELED' as const } },
  ])('resolves normally without access or opt-in: %o', async ({ enabled, subscription }) => {
    const closed = await closeTwitchBetById(false, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [{ key: DBSettings.discardZeroBets, value: enabled }],
      subscription,
    })

    expect(closed).toBeTruthy()
    expect(state.cancelPredictionCalls).toHaveLength(0)
    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'loss', predictionId: 'prediction-1', twitchId: 'twitch-1' },
    ])
  })

  it('resolves normally when no subscription is available', async () => {
    await closeTwitchBetById(true, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [{ key: DBSettings.discardZeroBets, value: true }],
    })

    expect(state.cancelPredictionCalls).toHaveLength(0)
    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'win', predictionId: 'prediction-1', twitchId: 'twitch-1' },
    ])
  })

  it('resolves normally for a Pro user who has not saved the setting', async () => {
    await closeTwitchBetById(true, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [],
      subscription: PRO_SUB,
    })

    expect(state.cancelPredictionCalls).toHaveLength(0)
    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'win', predictionId: 'prediction-1', twitchId: 'twitch-1' },
    ])
  })

  it('resolves normally when both outcomes have participants', async () => {
    state.predictions[0].outcomes[0].users = 10

    await closeTwitchBetById(true, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [{ key: DBSettings.discardZeroBets, value: true }],
      subscription: PRO_SUB,
    })

    expect(state.cancelPredictionCalls).toHaveLength(0)
    expect(state.resolvePredictionCalls).toStrictEqual([
      { outcomeId: 'win', predictionId: 'prediction-1', twitchId: 'twitch-1' },
    ])
  })

  it('refunds the requested prediction even when a newer one exists', async () => {
    state.predictions.unshift({ ...state.predictions[0], id: 'newer-prediction' })

    await closeTwitchBetById(true, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [{ key: DBSettings.discardZeroBets, value: true }],
      subscription: PRO_SUB,
    })

    expect(state.cancelPredictionCalls).toStrictEqual([
      { predictionId: 'prediction-1', twitchId: 'twitch-1' },
    ])
    expect(state.resolvePredictionCalls).toHaveLength(0)
  })

  it.each(['RESOLVED', 'CANCELED'])('leaves %s predictions untouched', async (status) => {
    state.predictions[0].status = status

    const closed = await closeTwitchBetById(true, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [{ key: DBSettings.discardZeroBets, value: true }],
      subscription: PRO_SUB,
    })

    expect(closed).toBeFalsy()
    expect(state.cancelPredictionCalls).toHaveLength(0)
    expect(state.resolvePredictionCalls).toHaveLength(0)
  })

  it('does not report success or resolve when the refund fails', async () => {
    state.cancelPredictionError = new Error('Twitch rejected cancellation')

    const closed = await closeTwitchBetById(true, 'twitch-1', 'prediction-1', 'match-1', {
      settings: [{ key: DBSettings.discardZeroBets, value: true }],
      subscription: PRO_SUB,
    })

    expect(closed).toBeFalsy()
    expect(state.resolvePredictionCalls).toHaveLength(0)
  })
})
