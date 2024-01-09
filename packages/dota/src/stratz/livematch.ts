import axios from 'axios'

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
): Promise<StratzLiveMatchResponse | undefined> => {
  if (!process.env.STRATZ_TOKEN) {
    return
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
        },
      },
    )

    return response.data
  } catch (error) {
    // console.error(error?.response?.data?.errors ?? error?.data ?? error)
    return undefined
  }
}
