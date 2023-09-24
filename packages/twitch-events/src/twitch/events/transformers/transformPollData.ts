import {
  EventSubChannelPollBeginEvent,
  EventSubChannelPollEndEvent,
  EventSubChannelPollProgressEvent,
} from '@twurple/eventsub-base'

export const transformPollData = (
  data:
    | EventSubChannelPollBeginEvent
    | EventSubChannelPollProgressEvent
    | EventSubChannelPollEndEvent,
) => ({
  choices: data.choices.map((choice) => {
    const hasVotes = 'totalVotes' in choice
    return {
      totalVotes: hasVotes ? choice.totalVotes : 0,
      title: choice.title,
    }
  }),
  title: data.title,
  endDate: data.endDate,
})
