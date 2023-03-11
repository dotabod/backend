import { EventSubChannelPredictionProgressEvent } from '@twurple/eventsub-base'

export const transformBetData = (data: EventSubChannelPredictionProgressEvent) => ({
  title: data.title,
  endDate: data.lockDate,
  outcomes: data.outcomes.map((outcome) => ({
    totalVotes: outcome.channelPoints,
    totalUsers: outcome.users,
    title: outcome.title,
    topUsers: Array.isArray(outcome.topPredictors)
      ? outcome.topPredictors.map((topUser) => ({
          userDisplayName: topUser.userDisplayName,
          channelPointsUsed: topUser.channelPointsUsed,
          channelPointsWon: topUser.channelPointsWon,
        }))
      : [],
  })),
})
