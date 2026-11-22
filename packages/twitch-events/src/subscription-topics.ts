import type { TwitchEventType } from '@dotabod/shared-utils/event-sub'

import type { EventSubscriptions } from './chat-sub-ids'

export const CHAT_SUBSCRIPTION_TYPE = 'channel.chat.message'

// The periodic sweep repairs only critical topics. Polls and predictions are
// registered on signup and on every requires_refresh flip.
export const CRITICAL_SUBSCRIPTION_TYPES = [
  CHAT_SUBSCRIPTION_TYPE,
  'stream.offline',
  'stream.online',
  'user.update',
] as const satisfies readonly TwitchEventType[]

export const SECONDARY_SUBSCRIPTION_TYPES = [
  'channel.prediction.begin',
  'channel.prediction.progress',
  'channel.prediction.lock',
  'channel.prediction.end',
  'channel.poll.begin',
  'channel.poll.progress',
  'channel.poll.end',
] as const satisfies readonly TwitchEventType[]

export type CriticalSubscriptionType = (typeof CRITICAL_SUBSCRIPTION_TYPES)[number]
export type UserSubscriptionType =
  | CriticalSubscriptionType
  | (typeof SECONDARY_SUBSCRIPTION_TYPES)[number]

export const findMissingSubscriptions = function findMissingSubscriptions<
  Topic extends UserSubscriptionType,
>(topics: readonly Topic[], existing: EventSubscriptions, isBanned: boolean): Topic[] {
  return topics.filter(
    (type) => existing[type] === undefined && !(type === CHAT_SUBSCRIPTION_TYPE && isBanned)
  )
}
