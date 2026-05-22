interface PredictionTopPredictor {
  user_name: string
  channel_points_used: number
  channel_points_won: number
}

interface PredictionOutcome {
  title: string
  channel_points?: number
  users?: number
  top_predictors?: PredictionTopPredictor[]
}

interface PredictionEvent {
  title: string
  locked_at?: string
  outcomes?: PredictionOutcome[]
}

export const transformBetData = (event: PredictionEvent) => {
  const hasLockDate = 'locked_at' in event
  return {
    title: event.title,
    endDate: hasLockDate ? new Date(event.locked_at as string) : '',
    outcomes: event?.outcomes?.map((outcome) => {
      const hasTopPredictors = 'top_predictors' in outcome

      return {
        totalVotes: hasTopPredictors ? outcome.channel_points : undefined,
        totalUsers: hasTopPredictors ? outcome.users : undefined,
        title: outcome.title,
        topUsers: hasTopPredictors
          ? outcome.top_predictors?.map((topUser) => ({
              userDisplayName: topUser.user_name,
              channelPointsUsed: topUser.channel_points_used,
              channelPointsWon: topUser.channel_points_won,
            }))
          : undefined,
      }
    }),
  }
}
