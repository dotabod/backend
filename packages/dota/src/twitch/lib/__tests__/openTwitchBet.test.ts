import { beforeEach, describe, expect, it } from 'vitest'

import { twitchIdToToken } from '../../../dota/lib/consts'
import {
  isPredictionAlreadyActiveError,
  makeClient,
  openTwitchBet,
  resetState,
  state,
} from './setupMocks'

function twitchApiError(body: Record<string, unknown>, statusCode = 400) {
  return Object.assign(new Error('Twitch API error'), {
    body: JSON.stringify(body),
    statusCode,
  })
}

describe(openTwitchBet, () => {
  beforeEach(() => {
    resetState()
    // disableBetsForTwitchId looks the dotabod token up from the Twitch id.
    twitchIdToToken.set('twitch-channel-1', 'token-abc')
  })

  it('rethrows a Twitch API error that is not one of the known special cases', async () => {
    // e.g. the real "prediction already active" conflict — has a JSON body,
    // but its message doesn't match either special-cased substring below.
    state.createPredictionError = twitchApiError({
      error: 'Conflict',
      message: 'ACTIVE_PREDICTION',
      status: 409,
    })

    await expect(openTwitchBet({ client: makeClient(), heroName: 'Slark' })).rejects.toThrow(
      'Twitch API error'
    )

    expect(state.loggerErrorCalls).toContainEqual({
      message: '[PREDICT] [BETS] Failed to open twitch bet',
      meta: expect.objectContaining({ heroName: 'Slark', twitchId: 'twitch-channel-1' }),
    })
    // Must not be misclassified as the "channel points not enabled" case.
    expect(state.trackDisableReasonCalls).toHaveLength(0)
  })

  it('recognizes and quietly propagates the structured active-prediction conflict', async () => {
    const error = twitchApiError({
      error: 'Bad Request',
      message: 'prediction event already active, only one allowed at a time',
      status: 400,
    })
    state.createPredictionError = error

    expect(isPredictionAlreadyActiveError(error)).toBeTruthy()
    await expect(openTwitchBet({ client: makeClient(), heroName: 'Slark' })).rejects.toBe(error)
    expect(state.loggerErrorCalls).toHaveLength(0)
  })

  it('does not classify the same message without Twitch HTTP 400 status', () => {
    const error = twitchApiError(
      { message: 'prediction event already active, only one allowed at a time' },
      409
    )

    expect(isPredictionAlreadyActiveError(error)).toBeFalsy()
  })

  it('swallows the error and disables bets when channel points are not enabled', async () => {
    state.createPredictionError = twitchApiError({
      error: 'Bad Request',
      message: 'channel points not enabled for this channel',
      status: 400,
    })

    const result = await openTwitchBet({ client: makeClient(), heroName: 'Slark' })

    expect(result).toBeUndefined()
    expect(state.loggerErrorCalls).toHaveLength(0)
    expect(state.trackDisableReasonCalls).toHaveLength(1)
    expect(state.upsertCalls).toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ value: false }) })
    )
  })

  it('returns the created prediction on success', async () => {
    const result = await openTwitchBet({ client: makeClient(), heroName: 'Slark' })

    expect(result).toStrictEqual({ id: 'new-prediction-id' })
    expect(state.createPredictionCalls).toHaveLength(1)
  })
})
