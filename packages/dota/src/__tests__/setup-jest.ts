import { afterAll, beforeAll } from '@jest/globals'

import { server } from '../dota/index'
import { apiClient } from './utils'

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
