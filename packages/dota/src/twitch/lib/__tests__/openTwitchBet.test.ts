import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { twitchIdToToken } from '../../../dota/lib/consts'
import { makeClient, openTwitchBet, resetState, state } from './setupMocks'

function twitchApiError(body: Record<string, unknown>) {
  return Object.assign(new Error('Twitch API error'), { body: JSON.stringify(body) })
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
