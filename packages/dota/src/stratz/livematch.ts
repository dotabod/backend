import axios from '../utils/axios.js'

const STRATZ_GQL = 'https://api.stratz.com/graphql'

// Currently we are only interested in the liveWinRateValues field
const LiveMatchDetailsQuery = (matchId: number) => `{
  live {
    match(id: ${matchId}) {
      liveWinRateValues {
        time
        winRate
      }
      completed
      isUpdating
    }
  }
}`

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

export const GetLiveMatch = async (
  matchId: number,
): Promise<StratzLiveMatchResponse | undefined> => {
  if (!process.env.STRATZ_TOKEN) {
    return
  }

  return (
    await axios.post<StratzLiveMatchResponse>(
      STRATZ_GQL,
      {
        query: LiveMatchDetailsQuery(matchId),
        variables: {},
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STRATZ_TOKEN}`,
        },
      },
    )
  ).data
}
