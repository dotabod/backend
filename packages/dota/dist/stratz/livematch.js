import axios from 'axios';
const STRATZ_GQL = 'https://api.stratz.com/graphql';
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
`;
export const GetLiveMatch = async (matchId) => {
    if (!process.env.STRATZ_TOKEN) {
        return;
    }
    try {
        const response = await axios.post(STRATZ_GQL, {
            query: LiveMatchDetailsQuery,
            variables: { matchId }, // Pass the matchId as a variable
        }, {
            headers: {
                Authorization: `Bearer ${process.env.STRATZ_TOKEN}`,
            },
        });
        return response.data;
    }
    catch (error) {
        // console.error(error?.response?.data?.errors ?? error?.data ?? error)
        return undefined;
    }
};
//# sourceMappingURL=livematch.js.map