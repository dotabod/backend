import { describe, it, jest } from '@jest/globals'

import { apiClient } from '../../../../__tests__/utils.js'
import { chatClient } from '../../../../twitch/chatClient.js'
import { DotaEventTypes } from '../../../../types.js'

const twitchChatSpy = jest.spyOn(chatClient, 'say')

describe('aegis denied', () => {
  let postData: any

  beforeEach((done) => {
    postData = {
      player: {
        activity: 'playing',
      },
      events: [
        {
          event_type: DotaEventTypes.AegisDenied,
          player_id: 1,
          game_time: Math.round(Math.random() * 1000),
        },
      ],
      auth: { token: 'cllx3i38n0007lxb7n5txh20e' },
    }

    // Make a POST request
    apiClient
      .post('/', postData)
      .then((response) => {
        expect(response.status).toBe(200)
        expect(response.data).toStrictEqual({ status: 'ok' })
        done()
      })
      .catch((e) => {
        done(e)
      })
  })

  it('should tell chat', (done) => {
    const timeout = setTimeout(() => {
      const expectedMessage = 'Teal denied the aegis ICANT'
      expect(twitchChatSpy).toHaveBeenCalledWith('destinee_schumm', expectedMessage)
      clearTimeout(timeout)
      done()
    }, 5000)
  }, 20_000)
})
