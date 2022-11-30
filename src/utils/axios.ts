import axios from 'axios'
import axiosRetry from 'axios-retry'

axios.interceptors.response.use(async (response) => {
  if (response.status === 200) {
    if (response.data?.result?.error) {
      const err = new Error(response.data?.result?.error)
      // @ts-expect-error axios-retry using this
      err.config = response.config
      // @ts-expect-error optional, if you need for retry condition
      err.response = response
      throw err
    }
  }
  return response
})

axiosRetry(axios, {
  retries: process.env.NODE_ENV === 'development' ? 1 : 7, // number of retries
  retryDelay: (retryCount) => {
    return retryCount * 4000 // time interval between retries
  },
  retryCondition: (error) => {
    return error.response?.status !== 200
  },
})

export default axios
