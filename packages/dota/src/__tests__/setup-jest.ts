import { beforeAll, jest } from '@jest/globals'

import { apiClient } from './utils.js'

beforeAll((done) => {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    // warn: jest.fn(),
    // error: jest.fn(),
  }

  const interval = setInterval(() => {
    apiClient
      .post('/')
      .then((response) => {
        if (response?.data) {
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

// afterAll((done) => {
//   const interval = setInterval(() => {
//     apiClient.post('/').catch((error) => {
//       clearInterval(interval) // Stop the interval
//       done() // Continue with the tests
//     })
//   }, 1000) // Check every 1 second

//   // keep calling axios.get until it returns {status: 'ok'
//   // then call done() to end the test
// }, 20_000)
