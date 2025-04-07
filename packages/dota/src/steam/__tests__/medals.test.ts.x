import { beforeEach } from 'node:test'

import { calculateAvg } from '../../dota/lib/calculateAvg.js'
import { getPlayers } from '../../dota/lib/getPlayers.js'
import { getHeroNameById } from '../../dota/lib/heroes.js'
import { gameMedals } from '../medals.js'
import mongo from '../mongo.js'

jest.mock('../mongo')
jest.mock('../dota/lib/getPlayers')
jest.mock('../dota/lib/calculateAvg')
jest.mock('../dota/lib/heroes')

describe('gameMedals', () => {
  const mockFind = jest.fn()
  const mockToArray = jest.fn()
  mongo.connect.mockResolvedValue({
    collection: () => ({
      find: mockFind,
      toArray: mockToArray,
    }),
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return medals for game players', async () => {
    mockFind.mockReturnValue({
      toArray: mockToArray,
    })
    mockToArray.mockResolvedValue(/* Your mock medals from MongoDB */)
    getPlayers.mockResolvedValue(/* Your mock players and cards */)
    calculateAvg.mockResolvedValue(/* Your mock average */)
    getHeroNameById.mockReturnValue(/* Your mock hero name */)

    const result = await gameMedals('en-US', 'someMatchId', [{ heroid: 1, accountid: 1 }])

    // Add your expectations
    expect(result).toBe(/* Whatever the output should be */)
  })

  // Add more test cases...
})
