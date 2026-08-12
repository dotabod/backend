import { beforeEach, describe, expect, it } from 'vite-plus/test'
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
    statusCode,
    body: JSON.stringify(body),
  })
}

describe('openTwitchBet', () => {
  beforeEach(() => {
    resetState()
    // disableBetsForTwitchId looks the dotabod token up from the Twitch id.
    twitchIdToToken.set('twitch-channel-1', 'token-abc')
  })

  it('rethrows a Twitch API error that is not one of the known special cases', async () => {
    // e.g. the real "prediction already active" conflict — has a JSON body,
    // but its message doesn't match either special-cased substring below.
    state.createPredictionError = twitchApiError({
      status: 409,
      error: 'Conflict',
      message: 'ACTIVE_PREDICTION',
    })

    await expect(openTwitchBet({ heroName: 'Slark', client: makeClient() })).rejects.toThrow(
      'Twitch API error',
    )

    expect(state.loggerErrorCalls).toContainEqual({
      message: '[PREDICT] [BETS] Failed to open twitch bet',
      meta: expect.objectContaining({ twitchId: 'twitch-channel-1', heroName: 'Slark' }),
    })
    // Must not be misclassified as the "channel points not enabled" case.
    expect(state.trackDisableReasonCalls).toHaveLength(0)
  })

  it('recognizes and quietly propagates the structured active-prediction conflict', async () => {
    const error = twitchApiError({
      status: 400,
      error: 'Bad Request',
      message: 'prediction event already active, only one allowed at a time',
    })
    state.createPredictionError = error

    expect(isPredictionAlreadyActiveError(error)).toBe(true)
    await expect(openTwitchBet({ heroName: 'Slark', client: makeClient() })).rejects.toBe(error)
    expect(state.loggerErrorCalls).toHaveLength(0)
  })

  it('does not classify the same message without Twitch HTTP 400 status', () => {
    const error = twitchApiError(
      { message: 'prediction event already active, only one allowed at a time' },
      409,
    )

    expect(isPredictionAlreadyActiveError(error)).toBe(false)
  })

  it('swallows the error and disables bets when channel points are not enabled', async () => {
    state.createPredictionError = twitchApiError({
      status: 400,
      error: 'Bad Request',
      message: 'channel points not enabled for this channel',
    })

    const result = await openTwitchBet({ heroName: 'Slark', client: makeClient() })

    expect(result).toBeUndefined()
    expect(state.loggerErrorCalls).toHaveLength(0)
    expect(state.trackDisableReasonCalls).toHaveLength(1)
    expect(state.upsertCalls).toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ value: false }) }),
    )
  })

  it('returns the created prediction on success', async () => {
    const result = await openTwitchBet({ heroName: 'Slark', client: makeClient() })

    expect(result).toEqual({ id: 'new-prediction-id' })
    expect(state.createPredictionCalls).toHaveLength(1)
  })
})
