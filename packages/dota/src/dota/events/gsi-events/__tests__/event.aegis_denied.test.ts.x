import { faker } from '@faker-js/faker'
import { beforeAll, describe, it } from '@jest/globals'

import { apiClient, twitchChatSpy } from '../../../../__tests__/utils.js'
import { prisma } from '../../../../db/prisma.js'
import { DotaEventTypes } from '../../../../types.js'

describe('aegis denied', () => {
  // might be less than 100 if some users are offline
  let USER_COUNT = 70

  const promises: Promise<any>[] = []

  beforeAll((done) => {
    prisma.user
      .findMany({
        take: USER_COUNT,
        select: { id: true },
        where: {
          stream_online: true,
          Account: {
            providerAccountId: {
              not: undefined,
            },
          },
        },
      })
      .then((users) => {
        USER_COUNT = users.length
        for (const user of users) {
          promises.push(
            apiClient
              .post('/', {
                player: {
                  activity: 'playing',
                },
                events: [
                  {
                    event_type: DotaEventTypes.AegisDenied,
                    player_id: faker.number.int({ min: 0, max: 9 }),
                    game_time: faker.number.int({ min: 0, max: 1_000_000 }),
                  },
                ],
                auth: { token: user.id },
              })
              .catch((e) => {
                done(e)
              }),
          )
        }
      })
      .catch((e) => {
        done(e)
      })

    Promise.all(promises)
      .then(() => {
        done()
      })
      .catch((e) => {
        console.log('PROMISE', e)
        done(e)
      })
  })
  it(
    'should tell chat',
    (done) => {
      let currentCallCount = 0
      let prevCallCount = 0
      let consecutiveSameCount = 0

      const interval = setInterval(() => {
        // loop twitchChatSpy.mock.calls and check that it was called with our argumnets
        const callLength = twitchChatSpy.mock.calls.filter(([, message]) =>
          message.match(/(?:denied|уничтожает)/i),
        ).length

        try {
          expect(callLength).toBe(USER_COUNT)
          clearInterval(interval)
          done()
        } catch (e) {
          // nothing
        }

        if (currentCallCount === prevCallCount) {
          consecutiveSameCount++
        } else {
          consecutiveSameCount = 0
        }

        if (consecutiveSameCount > 5) {
          clearInterval(interval)
          done(
            `call count ${USER_COUNT} ${currentCallCount} ${twitchChatSpy.mock.calls.length} did not change for 5 intervals`,
          )
        }

        prevCallCount = currentCallCount
        currentCallCount = callLength
      }, 1000)
    },
    USER_COUNT * 1000,
  )

  // check memory usage
  it('should not leak memory', () => {
    const used = process.memoryUsage()
    console.log('memory', used.heapUsed / 1000000)
    // value in megabytes
    expect(used.heapUsed / 1000000).toBeLessThan(350_000)
  })
})
