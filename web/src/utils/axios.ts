import axios from 'axios'
import axiosRetry from 'axios-retry'

axios.interceptors.response.use((response) => {
  // not an error
  if (response.data?.result?.error === 'Practice matches are not available via GetMatchDetails') {
    return response
  }

  // opendota is data.error
  // steam is data.result.error
  if (response.status === 200 && !response.data?.result?.error && !response.data?.error) {
    return response
  }

  const err = new Error(response.data?.result?.error || !response.data?.error)
  // @ts-expect-error axios-retry using this
  err.config = response.config
  // @ts-expect-error optional, if you need for retry condition
  err.response = response
  throw err
})

// @ts-expect-error ??? its callable
axiosRetry(axios, {
  retries: process.env.NODE_ENV === 'development' ? 1 : 7, // number of retries
  retryDelay: (retryCount: number) => {
    return retryCount * 4000 // time interval between retries
  },
  retryCondition: (error: any) => {
    console.log('retryCondition')
    return true
  },
})

export default axios