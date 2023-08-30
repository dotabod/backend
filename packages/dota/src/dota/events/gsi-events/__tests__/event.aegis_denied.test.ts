import axios from 'axios'

import { chatClient } from '../../../../twitch/index.js'
import { DotaEvent, DotaEventTypes } from '../../../../types.js'
import { events } from '../../../globalEventEmitter.js'

const mockedSay = jest.mocked(chatClient.say)

// Set base URL for axios, assuming your API runs on localhost:81
const apiClient = axios.create({
  baseURL: 'http://localhost:81',
})

describe('API tests', () => {
  it('should respond correctly to POST request', (done) => {
    // Your POST request data
    const postData = {
      player: {
        activity: 'playing',
      },
      events: [
        {
          event_type: DotaEventTypes.AegisDenied,
          player_id: 1,
          game_time: Math.random() * 1000,
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

        events.once(`event:${DotaEventTypes.AegisDenied}`, (event: DotaEvent) => {
          try {
            expect(event).toStrictEqual({
              event_type: DotaEventTypes.AegisDenied,
              player_id: 1,
              game_time: 50,
            })

            // wait for say to have been called within 5 seconds
            setTimeout(() => {
              expect(mockedSay).toBeCalledWith('destinee_schumm', 'Teal denied the aegis ICANT')
              done()
            }, 5000)
          } catch (error) {
            done(error)
          }
        })

        events.emit(
          `event:${DotaEventTypes.AegisDenied}`,
          {
            event_type: DotaEventTypes.AegisDenied,
            player_id: 1,
            game_time: 50,
          } as DotaEvent,
          'cllx3i38n0007lxb7n5txh20e',
        )
      })
      .catch((e) => {
        done(e)
      })
  })
})
