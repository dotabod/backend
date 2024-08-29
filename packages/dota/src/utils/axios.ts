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

// dev retries for 12 seconds, 2 times
// prod retries for 112 seconds, 7 times
axiosRetry(axios, {
  retries: process.env.DOTABOD_ENV === 'development' ? 2 : 7,
  retryDelay: (retryCount: number) => {
    return retryCount * 4000
  },
  retryCondition: (error: any) => {
    return true
  },
})

export default axios
