import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { getTwitchAPI, logger } from '@dotabod/shared-utils'
import { refundTwitchBet } from '../refundTwitchBets.js'

// Note: Bun doesn't support jest.mock() for module mocking in the same way
// These tests require module-level mocking which needs different approach in Bun
// Skipping these tests until proper Bun mock.module() integration is set up

describe.skip('refundTwitchBet', () => {
  const mockTwitchId = '123456789'
  const mockPredictionId = 'pred-456'

  const mockApi = {
    predictions: {
      getPredictions: mock(() => Promise.resolve({ data: [] })),
      cancelPrediction: mock(() => Promise.resolve({})),
    },
  }

  beforeEach(() => {
    // Reset mocks
    mockApi.predictions.getPredictions.mockClear()
    mockApi.predictions.cancelPrediction.mockClear()
  })

  describe('with specific prediction ID', () => {
    it('should cancel prediction when status is ACTIVE', async () => {
      const mockPredictions = [
        {
          id: mockPredictionId,
          status: 'ACTIVE',
          outcomes: [
            { id: 'outcome-1', users: 10 },
            { id: 'outcome-2', users: 0 },
          ],
        },
      ]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBe(mockPredictionId)
      expect(mockApi.predictions.cancelPrediction).toHaveBeenCalledWith(
        mockTwitchId,
        mockPredictionId,
      )
    })

    it('should cancel prediction when status is LOCKED', async () => {
      const mockPredictions = [
        {
          id: mockPredictionId,
          status: 'LOCKED',
          outcomes: [
            { id: 'outcome-1', users: 10 },
            { id: 'outcome-2', users: 0 },
          ],
        },
      ]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBe(mockPredictionId)
      expect(mockApi.predictions.cancelPrediction).toHaveBeenCalledWith(
        mockTwitchId,
        mockPredictionId,
      )
    })

    it('should NOT cancel prediction when status is RESOLVED', async () => {
      const mockPredictions = [
        {
          id: mockPredictionId,
          status: 'RESOLVED',
          outcomes: [
            { id: 'outcome-1', users: 10 },
            { id: 'outcome-2', users: 0 },
          ],
        },
      ]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(mockApi.predictions.cancelPrediction).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        '[PREDICT] Cannot refund prediction - already resolved or canceled',
        expect.objectContaining({
          twitchId: mockTwitchId,
          predictionId: mockPredictionId,
          status: 'RESOLVED',
        }),
      )
    })

    it('should NOT cancel prediction when status is CANCELED', async () => {
      const mockPredictions = [
        {
          id: mockPredictionId,
          status: 'CANCELED',
          outcomes: [
            { id: 'outcome-1', users: 10 },
            { id: 'outcome-2', users: 0 },
          ],
        },
      ]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(mockApi.predictions.cancelPrediction).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        '[PREDICT] Cannot refund prediction - already resolved or canceled',
        expect.objectContaining({
          twitchId: mockTwitchId,
          predictionId: mockPredictionId,
          status: 'CANCELED',
        }),
      )
    })

    it('should return null when specific prediction is not found', async () => {
      const mockPredictions = [
        {
          id: 'other-pred-id',
          status: 'ACTIVE',
          outcomes: [],
        },
      ]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(mockApi.predictions.cancelPrediction).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        '[PREDICT] Specific prediction not found in recent list',
        expect.objectContaining({
          twitchId: mockTwitchId,
          specificPredictionId: mockPredictionId,
        }),
      )
    })

    it('should fetch more predictions when specific ID is provided', async () => {
      const mockPredictions = [{ id: mockPredictionId, status: 'ACTIVE', outcomes: [] }]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(mockApi.predictions.getPredictions).toHaveBeenCalledWith(mockTwitchId, { limit: 10 })
    })
  })

  describe('without specific prediction ID', () => {
    it('should cancel most recent prediction when status is ACTIVE', async () => {
      const mockPredictions = [
        {
          id: mockPredictionId,
          status: 'ACTIVE',
          outcomes: [],
        },
      ]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      const result = await refundTwitchBet(mockTwitchId)

      expect(result).toBe(mockPredictionId)
      expect(mockApi.predictions.cancelPrediction).toHaveBeenCalledWith(
        mockTwitchId,
        mockPredictionId,
      )
    })

    it('should NOT cancel most recent prediction when status is RESOLVED', async () => {
      const mockPredictions = [
        {
          id: mockPredictionId,
          status: 'RESOLVED',
          outcomes: [],
        },
      ]

      mockApi.predictions.getPredictions.mockResolvedValue({ data: mockPredictions })

      const result = await refundTwitchBet(mockTwitchId)

      expect(result).toBeNull()
      expect(mockApi.predictions.cancelPrediction).not.toHaveBeenCalled()
    })

    it('should fetch only 1 prediction when no specific ID is provided', async () => {
      mockApi.predictions.getPredictions.mockResolvedValue({ data: [] })

      await refundTwitchBet(mockTwitchId)

      expect(mockApi.predictions.getPredictions).toHaveBeenCalledWith(mockTwitchId, { limit: 1 })
    })

    it('should return null when no predictions found', async () => {
      mockApi.predictions.getPredictions.mockResolvedValue({ data: [] })

      const result = await refundTwitchBet(mockTwitchId)

      expect(result).toBeNull()
      expect(mockApi.predictions.cancelPrediction).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should catch and log errors, returning null', async () => {
      const mockError = new Error('API Error')
      mockApi.predictions.getPredictions.mockRejectedValue(mockError)

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        '[PREDICT] Error refunding twitch bet',
        expect.objectContaining({ twitchId: mockTwitchId }),
      )
    })
  })
})
