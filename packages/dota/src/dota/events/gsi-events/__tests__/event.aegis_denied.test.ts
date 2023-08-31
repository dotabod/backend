import axios from 'axios'

import { initServer } from '../../../../index.js'
import { chatClient } from '../../../../twitch/chatClient.js'
import { DotaEvent, DotaEventTypes } from '../../../../types.js'
import { events } from '../../../globalEventEmitter.js'

jest.mock('../../../../twitch/chatClient.js', () => {
  return {
    join: jest.fn(),
    part: jest.fn(),
    say: jest.fn(),
  }
})

const apiClient = axios.create({
  baseURL: 'http://localhost:5120',
})

beforeAll(() => {
  initServer()
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
    events.on(`event:${DotaEventTypes.AegisDenied}`, (event: DotaEvent, token: string) => {
      try {
        expect(event).toStrictEqual(postData.events[0])
        done()
      } catch (error) {
        done(error)
      }
    })

    // Make a POST request
    apiClient
      .post('/', postData)
      .then((response) => {
        expect(response.status).toBe(200)
        expect(response.data).toStrictEqual({ status: 'ok' })
      })
      .catch((e) => {
        done(e)
      })

    // wait for say to have been called within 5 seconds
    expect(chatClient.say).toBeCalledWith('destinee_schumm', 'Teal denied the aegis ICANT')
  })
})
