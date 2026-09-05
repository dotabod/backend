interface PredictionTopPredictor {
  user_name: string
  channel_points_used: number
  channel_points_won: number | null
}

interface PredictionOutcome {
  title: string
  channel_points?: number
  users?: number
  top_predictors?: PredictionTopPredictor[]
}

interface PredictionEvent {
  title: string
  locks_at?: string
  locked_at?: string
  ended_at?: string
  outcomes?: PredictionOutcome[]
}

export const transformBetData = (event: PredictionEvent) => {
  const rawDate = event.locks_at ?? event.locked_at ?? event.ended_at
  return {
    endDate: rawDate ? new Date(rawDate) : '',
    outcomes: event?.outcomes?.map((outcome) => {
      const hasTopPredictors = 'top_predictors' in outcome

      return {
        title: outcome.title,
        topUsers: hasTopPredictors
          ? outcome.top_predictors?.map((topUser) => ({
              channelPointsUsed: topUser.channel_points_used,
              channelPointsWon: topUser.channel_points_won,
              userDisplayName: topUser.user_name,
            }))
          : undefined,
        totalUsers: hasTopPredictors ? outcome.users : undefined,
        totalVotes: hasTopPredictors ? outcome.channel_points : undefined,
      }
    }),
    title: event.title,
  }
}
