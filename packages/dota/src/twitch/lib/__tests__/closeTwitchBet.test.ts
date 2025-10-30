import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { DBSettings } from '../../../settings.js'
import type { SocketClient } from '../../../types.js'
import { closeTwitchBet } from '../closeTwitchBet.js'
import { refundTwitchBet } from '../refundTwitchBets.js'

// Mock dependencies
jest.mock('@dotabod/shared-utils')
jest.mock('../refundTwitchBets.js')

describe('closeTwitchBet', () => {
  const mockTwitchId = '123456789'
  const mockMatchId = 'match-123'
  const mockPredictionId = 'pred-456'

  const mockApi = {
    streams: {
      createStreamMarker: jest.fn().mockResolvedValue({}),
    },
    predictions: {
      getPredictions: jest.fn(),
      resolvePrediction: jest.fn().mockResolvedValue({}),
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getTwitchAPI as jest.Mock).mockResolvedValue(mockApi)
    ;(refundTwitchBet as jest.Mock).mockResolvedValue(mockPredictionId)
    jest.spyOn(logger, 'info')
    jest.spyOn(logger, 'error')
  })

  it('should resolve prediction normally when discardZeroBets is disabled', async () => {
    const mockPredictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 10, title: 'Yes' },
          { id: 'outcome-2', users: 0, title: 'No' },
        ],
      },
    ]

    mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

    const settings: SocketClient['settings'] = [
      { key: DBSettings.discardZeroBets, value: false },
    ]

    await closeTwitchBet(true, mockTwitchId, mockMatchId, settings, undefined)

    expect(mockApi.predictions.resolvePrediction).toHaveBeenCalledWith(
      mockTwitchId,
      mockPredictionId,
      'outcome-1',
    )
    expect(refundTwitchBet).not.toHaveBeenCalled()
  })

  it('should refund prediction when discardZeroBets is enabled and winning side has zero users', async () => {
    const mockPredictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 0, title: 'Yes' },
          { id: 'outcome-2', users: 5, title: 'No' },
        ],
      },
    ]

    mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

    const settings: SocketClient['settings'] = [
      { key: DBSettings.discardZeroBets, value: true },
    ]

    await closeTwitchBet(true, mockTwitchId, mockMatchId, settings, undefined)

    expect(refundTwitchBet).toHaveBeenCalledWith(mockTwitchId, mockPredictionId)
    expect(mockApi.predictions.resolvePrediction).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      '[PREDICT] [BETS] Refunding prediction - zero predictions on one side',
      expect.objectContaining({
        twitchId: mockTwitchId,
        matchId: mockMatchId,
        wonOutcomeUsers: 0,
        lossOutcomeUsers: 5,
      }),
    )
  })

  it('should refund prediction when discardZeroBets is enabled and losing side has zero users', async () => {
    const mockPredictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 8, title: 'Yes' },
          { id: 'outcome-2', users: 0, title: 'No' },
        ],
      },
    ]

    mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

    const settings: SocketClient['settings'] = [
      { key: DBSettings.discardZeroBets, value: true },
    ]

    await closeTwitchBet(false, mockTwitchId, mockMatchId, settings, undefined)

    expect(refundTwitchBet).toHaveBeenCalledWith(mockTwitchId, mockPredictionId)
    expect(mockApi.predictions.resolvePrediction).not.toHaveBeenCalled()
  })

  it('should resolve prediction normally when both sides have users even if discardZeroBets is enabled', async () => {
    const mockPredictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 10, title: 'Yes' },
          { id: 'outcome-2', users: 5, title: 'No' },
        ],
      },
    ]

    mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

    const settings: SocketClient['settings'] = [
      { key: DBSettings.discardZeroBets, value: true },
    ]

    await closeTwitchBet(true, mockTwitchId, mockMatchId, settings, undefined)

    expect(mockApi.predictions.resolvePrediction).toHaveBeenCalledWith(
      mockTwitchId,
      mockPredictionId,
      'outcome-1',
    )
    expect(refundTwitchBet).not.toHaveBeenCalled()
  })

  it('should resolve prediction normally when discardZeroBets setting is not provided (default false)', async () => {
    const mockPredictions = [
      {
        id: mockPredictionId,
        outcomes: [
          { id: 'outcome-1', users: 10, title: 'Yes' },
          { id: 'outcome-2', users: 0, title: 'No' },
        ],
      },
    ]

    mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

    await closeTwitchBet(true, mockTwitchId, mockMatchId, undefined, undefined)

    expect(mockApi.predictions.resolvePrediction).toHaveBeenCalledWith(
      mockTwitchId,
      mockPredictionId,
      'outcome-1',
    )
    expect(refundTwitchBet).not.toHaveBeenCalled()
  })

  it('should handle case with no predictions found', async () => {
    mockApi.predictions.getPredictions.mockResolvedValue({ data: [] })

    await closeTwitchBet(true, mockTwitchId, mockMatchId, undefined, undefined)

    expect(mockApi.predictions.resolvePrediction).not.toHaveBeenCalled()
    expect(refundTwitchBet).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      '[PREDICT] Close bets - no predictions found',
      expect.any(Object),
    )
  })
})
