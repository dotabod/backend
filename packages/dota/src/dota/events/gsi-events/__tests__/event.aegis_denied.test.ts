import { beforeAll, describe, it, jest } from '@jest/globals'
import axios from 'axios'

import { chatClient } from '../../../../twitch/chatClient.js'
import { DotaEvent, DotaEventTypes } from '../../../../types.js'
import { events } from '../../../globalEventEmitter.js'
import { server } from '../../../index'
const twitchChatSpy = jest.spyOn(chatClient, 'say')

const apiClient = axios.create({
  baseURL: 'http://localhost:5120',
})

beforeAll((done) => {
  server.dota // not used
  const interval = setInterval(() => {
    apiClient
      .post('/')
      .then((response) => {
        if (response.data && response.data) {
          clearInterval(interval) // Stop the interval
          done() // Continue with the tests
        }
      })
      .catch((error) => {
        // Handle error, perhaps log it but don't call done(error) here
        // because we're inside an interval and it will keep calling
      })
  }, 1000) // Check every 1 second

  // keep calling axios.get until it returns {status: 'ok'
  // then call done() to end the test
}, 20_000)

afterAll((done) => {
  Promise.all([server.dota.exit()])
    .then(() => {
      console.log('Successfully exited')
      done()
    })
    .catch((e) => {
      console.error('Error during teardown:', e)
      done(e)
    })
}, 10_000)

describe('API tests', () => {
  it('should tell us if aegis is denied', (done) => {
    // Your POST request data
    const postData = {
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

    events.on(`event:${DotaEventTypes.AegisDenied}`, (event: DotaEvent, token: string) => {
      try {
        expect(token).toStrictEqual(postData.auth.token)
        expect(event).toStrictEqual(postData.events[0])

        // wait for say to have been called within 5 seconds
        setTimeout(() => {
          expect(twitchChatSpy).toBeCalledWith('destinee_schumm', 'Teal denied the aegis ICANT')
          done()
        }, 5000)
      } catch (error: any) {
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
  }, 20_000)
})
