import {
  EventSubChannelPredictionBeginEvent,
  EventSubChannelPredictionEndEvent,
  EventSubChannelPredictionLockEvent,
  EventSubChannelPredictionProgressEvent,
} from '@twurple/eventsub-base'

export const transformBetData = (
  event:
    | EventSubChannelPredictionProgressEvent
    | EventSubChannelPredictionBeginEvent
    | EventSubChannelPredictionEndEvent
    | EventSubChannelPredictionLockEvent,
) => {
  const hasLockDate = 'lockDate' in event
  return {
    title: event.title,
    endDate: hasLockDate ? event?.lockDate : '',
    outcomes: event?.outcomes?.map((outcome) => {
      const hasTopPredictors = 'topPredictors' in outcome

      return {
        totalVotes: hasTopPredictors ? outcome.channelPoints : undefined,
        totalUsers: hasTopPredictors ? outcome.users : undefined,
        title: outcome.title,
        topUsers: hasTopPredictors
          ? outcome.topPredictors.map((topUser) => ({
              userDisplayName: topUser.userDisplayName,
              channelPointsUsed: topUser.channelPointsUsed,
              channelPointsWon: topUser.channelPointsWon,
            }))
          : undefined,
      }
    }),
  }
}
