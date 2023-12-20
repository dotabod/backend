import { beforeAll } from '@jest/globals';
import { apiClient } from './utils.js';
beforeAll((done) => {
    const interval = setInterval(() => {
        apiClient
            .get('/')
            .then((response) => {
            if (response?.data) {
                console.log('response.data', response.data);
                clearInterval(interval); // Stop the interval
                setTimeout(() => {
                    done(); // Continue with the tests
                }, 3000);
            }
        })
            .catch((error) => {
            // Handle error, perhaps log it but don't call done(error) here
            // because we're inside an interval and it will keep calling
        });
    }, 1000); // Check every 1 second
    // keep calling axios.get until it returns {status: 'ok'
    // then call done() to end the test
}, 20_000);
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
//# sourceMappingURL=setup-jest.js.map