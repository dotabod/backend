import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { refundTwitchBet, resetState, state } from './setupMocks'

describe('refundTwitchBet', () => {
  const mockTwitchId = '123456789'
  const mockPredictionId = 'pred-456'

  beforeEach(() => {
    resetState()
  })

  describe('with specific prediction ID', () => {
    it('should cancel prediction when status is ACTIVE', async () => {
      state.predictions = [
        {
          id: mockPredictionId,
          status: 'ACTIVE',
          outcomes: [
            { id: 'outcome-1', users: 10, title: 'Yes' },
            { id: 'outcome-2', users: 0, title: 'No' },
          ],
        },
      ]

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBe(mockPredictionId)
      expect(state.cancelPredictionCalls).toEqual([
        { twitchId: mockTwitchId, predictionId: mockPredictionId },
      ])
    })

    it('should cancel prediction when status is LOCKED', async () => {
      state.predictions = [
        {
          id: mockPredictionId,
          status: 'LOCKED',
          outcomes: [
            { id: 'outcome-1', users: 10, title: 'Yes' },
            { id: 'outcome-2', users: 0, title: 'No' },
          ],
        },
      ]

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBe(mockPredictionId)
      expect(state.cancelPredictionCalls).toEqual([
        { twitchId: mockTwitchId, predictionId: mockPredictionId },
      ])
    })

    it('should NOT cancel prediction when status is RESOLVED', async () => {
      state.predictions = [
        {
          id: mockPredictionId,
          status: 'RESOLVED',
          outcomes: [
            { id: 'outcome-1', users: 10, title: 'Yes' },
            { id: 'outcome-2', users: 0, title: 'No' },
          ],
        },
      ]

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(state.cancelPredictionCalls).toHaveLength(0)
      expect(state.loggerInfoCalls).toContainEqual({
        message: '[PREDICT] Cannot refund prediction - already resolved or canceled',
        meta: expect.objectContaining({
          twitchId: mockTwitchId,
          predictionId: mockPredictionId,
          status: 'RESOLVED',
        }),
      })
    })

    it('should NOT cancel prediction when status is CANCELED', async () => {
      state.predictions = [
        {
          id: mockPredictionId,
          status: 'CANCELED',
          outcomes: [
            { id: 'outcome-1', users: 10, title: 'Yes' },
            { id: 'outcome-2', users: 0, title: 'No' },
          ],
        },
      ]

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(state.cancelPredictionCalls).toHaveLength(0)
      expect(state.loggerInfoCalls).toContainEqual({
        message: '[PREDICT] Cannot refund prediction - already resolved or canceled',
        meta: expect.objectContaining({
          twitchId: mockTwitchId,
          predictionId: mockPredictionId,
          status: 'CANCELED',
        }),
      })
    })

    it('should return null when specific prediction is not found', async () => {
      state.predictions = [
        {
          id: 'other-pred-id',
          status: 'ACTIVE',
          outcomes: [],
        },
      ]

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(state.cancelPredictionCalls).toHaveLength(0)
      expect(state.loggerInfoCalls).toContainEqual({
        message: '[PREDICT] Specific prediction not found in recent list',
        meta: expect.objectContaining({
          twitchId: mockTwitchId,
          specificPredictionId: mockPredictionId,
        }),
      })
    })

    it('should fetch more predictions when specific ID is provided', async () => {
      state.predictions = [{ id: mockPredictionId, status: 'ACTIVE', outcomes: [] }]

      await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(state.getPredictionsCalls).toEqual([{ twitchId: mockTwitchId, opts: { limit: 10 } }])
    })
  })

  describe('without specific prediction ID', () => {
    it('should cancel most recent prediction when status is ACTIVE', async () => {
      state.predictions = [
        {
          id: mockPredictionId,
          status: 'ACTIVE',
          outcomes: [],
        },
      ]

      const result = await refundTwitchBet(mockTwitchId)

      expect(result).toBe(mockPredictionId)
      expect(state.cancelPredictionCalls).toEqual([
        { twitchId: mockTwitchId, predictionId: mockPredictionId },
      ])
    })

    it('should NOT cancel most recent prediction when status is RESOLVED', async () => {
      state.predictions = [
        {
          id: mockPredictionId,
          status: 'RESOLVED',
          outcomes: [],
        },
      ]

      const result = await refundTwitchBet(mockTwitchId)

      expect(result).toBeNull()
      expect(state.cancelPredictionCalls).toHaveLength(0)
    })

    it('should fetch only 1 prediction when no specific ID is provided', async () => {
      state.predictions = []

      await refundTwitchBet(mockTwitchId)

      expect(state.getPredictionsCalls).toEqual([{ twitchId: mockTwitchId, opts: { limit: 1 } }])
    })

    it('should return null when no predictions found', async () => {
      state.predictions = []

      const result = await refundTwitchBet(mockTwitchId)

      expect(result).toBeNull()
      expect(state.cancelPredictionCalls).toHaveLength(0)
    })
  })

  describe('error handling', () => {
    it('should catch and log errors, returning null', async () => {
      state.getPredictionsError = new Error('API Error')

      const result = await refundTwitchBet(mockTwitchId, mockPredictionId)

      expect(result).toBeNull()
      expect(state.loggerErrorCalls).toContainEqual({
        message: '[PREDICT] Error refunding twitch bet',
        meta: expect.objectContaining({ twitchId: mockTwitchId }),
      })
    })
  })
})
