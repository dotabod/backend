import { EventSubChannelPollChoice, EventSubChannelPollProgressEvent } from '@twurple/eventsub-base'

export const transformPollData = (data: EventSubChannelPollProgressEvent) => ({
  choices: data.choices.map((choice: EventSubChannelPollChoice) => ({
    totalVotes: choice.totalVotes,
    title: choice.title,
  })),
  title: data.title,
  endDate: data.endDate,
})
