import axios from 'axios'
import axiosRetry from 'axios-retry'

axiosRetry(axios, {
  retries: 5, // number of retries
  retryDelay: (retryCount) => {
    console.log(`retry attempt: ${retryCount}`)
    return retryCount * 4000 // time interval between retries
  },
  retryCondition: (error) => {
    return error.response?.status !== 200
  },
})

export default axios
