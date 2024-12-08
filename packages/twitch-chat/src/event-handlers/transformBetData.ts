export const transformBetData = (event: any) => {
  const hasLockDate = 'locked_at' in event
  return {
    title: event.title,
    endDate: hasLockDate ? new Date(event.locked_at) : '',
    outcomes: event?.outcomes?.map((outcome: any) => {
      const hasTopPredictors = 'top_predictors' in outcome

      return {
        totalVotes: hasTopPredictors ? outcome.channel_points : undefined,
        totalUsers: hasTopPredictors ? outcome.users : undefined,
        title: outcome.title,
        topUsers: hasTopPredictors
          ? outcome.top_predictors.map((topUser: any) => ({
              userDisplayName: topUser.user_name,
              channelPointsUsed: topUser.channel_points_used,
              channelPointsWon: topUser.channel_points_won,
            }))
          : undefined,
      }
    }),
  }
}
