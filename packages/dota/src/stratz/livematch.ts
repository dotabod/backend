import axios from 'axios'
import { logger } from '../utils/logger'

// Credits to Stratz for the GraphQL query for live match details
// They do awesome work and you should check them out at https://stratz.com/
const STRATZ_GQL = 'https://api.stratz.com/graphql'

const LiveMatchDetailsQuery = `
  query GetLiveMatch($matchId: Long!) {
    live {
      match(id: $matchId) {
        liveWinRateValues {
          time
          winRate
        }
        completed
        isUpdating
      }
    }
  }
`

type StratzLiveMatchResponse = {
  data: {
    live: {
      match?: {
        liveWinRateValues: Array<{
          time: number
          winRate: number
        }>
        completed: boolean
        isUpdating: boolean
      }
    }
  }
}

export const getWinProbability2MinAgo = async (
  matchId: number,
): Promise<StratzLiveMatchResponse | { error: string }> => {
  if (!process.env.STRATZ_TOKEN) {
    logger.error('STRATZ_TOKEN is not set')
    return { error: 'STRATZ_TOKEN is not set' }
  }

  try {
    const response = await axios.post<StratzLiveMatchResponse>(
      STRATZ_GQL,
      {
        query: LiveMatchDetailsQuery,
        variables: { matchId }, // Pass the matchId as a variable
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STRATZ_TOKEN}`,
          'User-Agent': 'STRATZ_API',
        },
      },
    )

    return response.data
  } catch (error) {
    logger.error('Error fetching live match details', { error })
    return { error: 'Error fetching live match details' }
  }
}
