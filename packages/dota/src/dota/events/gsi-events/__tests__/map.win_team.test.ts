import { describe, it } from '@jest/globals'

import { gameEnd } from '../../../../__tests__/play-by-plays.js'
import { apiClient } from '../../../../__tests__/utils.js'
import { checkCallAndMemory } from './checkCallAndMemory.js'
import { fetchOnlineUsers } from './fetchOnlineUsers.js'

const USER_COUNT = 1

async function postEventsForUsers(
  users: {
    id: string
  }[],
  win_team: 'radiant' | 'dire' = 'radiant',
) {
  const promises = users.map((user) => {
    return gameEnd({
      win_team,
      matchId: '123',
      steam32: '123',
      steam64: '123456',
      token: user.id,
    }).map((step) => {
      return apiClient.post('/', step)
    })
  })
  return await Promise.allSettled(promises)
}

describe('win events', () => {
  it('radiant won - should tell chat', async () => {
    const users = await fetchOnlineUsers(USER_COUNT)
    await postEventsForUsers(users, 'radiant')
    await checkCallAndMemory(/(?:won|победили)/i, users.length)
  })

  it('dire won - should tell chat', async () => {
    const users = await fetchOnlineUsers(USER_COUNT)
    await postEventsForUsers(users, 'dire')
    await checkCallAndMemory(/(?:lost|проиграли)/i, users.length)
  })

  it('should still access server', async () => {
    return new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        apiClient
          .get('/')
          .then((response) => {
            if (!response?.data) return
            clearInterval(interval)
            resolve()
          })
          .catch(() => {
            clearInterval(interval)
            reject()
          })
      }, 500)
    })
  }, 5000)
})
