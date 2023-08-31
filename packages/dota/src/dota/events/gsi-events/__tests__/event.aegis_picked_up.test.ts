import { faker } from '@faker-js/faker'
import { beforeAll, describe, it } from '@jest/globals'

import { apiClient, twitchChatSpy } from '../../../../__tests__/utils.js'
import { prisma } from '../../../../db/prisma.js'
import { DotaEventTypes } from '../../../../types.js'

describe('aegis picked up', () => {
  // might be less than 100 if some users are offline
  let USER_COUNT = 5

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
        console.log({ USER_COUNT })
        for (const user of users) {
          promises.push(
            apiClient
              .post('/', {
                player: {
                  activity: 'playing',
                },
                events: [
                  {
                    event_type: DotaEventTypes.AegisPickedUp,
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

    Promise.allSettled(promises)
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
        const callLength = twitchChatSpy.mock.calls.filter(([, message]) =>
          message.match(/(?:picked|подбирает)/i),
        ).length
        const { heapUsed, rss } = process.memoryUsage()
        const mb = rss / 1000000
        try {
          expect(callLength).toBe(USER_COUNT)

          expect(mb).toBeLessThan(400)

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

        if (consecutiveSameCount > 2) {
          clearInterval(interval)
          done(
            `call count ${USER_COUNT} ${currentCallCount} ${twitchChatSpy.mock.calls.length} and mb use ${mb}`,
          )
        }

        prevCallCount = currentCallCount
        currentCallCount = callLength
      }, 1000)
    },
    USER_COUNT * 1000,
  )

  it('should still access server', (done) => {
    const interval = setInterval(() => {
      apiClient
        .get('/')
        .then((response) => {
          if (response?.data) {
            console.log('response.data', response.data)
            clearInterval(interval) // Stop the interval
            setTimeout(() => {
              done() // Continue with the tests
            }, 3000)
          }
        })
        .catch((error) => {
          // Handle error, perhaps log it but don't call done(error) here
          // because we're inside an interval and it will keep calling
        })
    }, 500) // Check every 1 second
  }, 5000)
})
