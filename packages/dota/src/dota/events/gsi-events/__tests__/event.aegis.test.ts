import { faker } from '@faker-js/faker'
import { describe, it } from '@jest/globals'

import { apiClient } from '../../../../__tests__/utils.js'
import { DotaEventTypes } from '../../../../types.js'
import { checkCallAndMemory } from './checkCallAndMemory.js'
import { fetchOnlineUsers } from './fetchOnlineUsers.js'

const USER_COUNT = 1

async function postEventsForUsers(
  users: {
    id: string
  }[],
  eventType: DotaEventTypes,
) {
  const promises = users.map((user) =>
    apiClient.post('/', {
      player: {
        activity: 'playing',
      },
      events: [
        {
          event_type: eventType,
          player_id: faker.number.int({ min: 0, max: 9 }),
          game_time: faker.number.int({ min: 0, max: 1_000_000 }),
        },
      ],
      auth: { token: user.id },
    }),
  )
  await Promise.allSettled(promises)
}

describe('aegis events', () => {
  it(
    'aegis denied - should tell chat',
    async () => {
      const users = await fetchOnlineUsers(USER_COUNT)
      await postEventsForUsers(users, DotaEventTypes.AegisDenied)
      await checkCallAndMemory(/(?:denied|уничтожает)/i, users.length)
    },
    USER_COUNT * 1000,
  )

  it(
    'aegis picked up - should tell chat',
    async () => {
      const users = await fetchOnlineUsers(USER_COUNT)
      await postEventsForUsers(users, DotaEventTypes.AegisPickedUp)
      await checkCallAndMemory(/(?:picked|подбирает)/i, users.length)
    },
    USER_COUNT * 1000,
  )

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
