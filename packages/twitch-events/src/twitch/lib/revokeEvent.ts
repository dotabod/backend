import { getAppToken } from '@twurple/auth'
import type { EventSubUserAuthorizationRevokeEvent } from '@twurple/eventsub-base'
import supabase from '../../db/supabase'

async function disableChannel(broadcasterId: string) {
  const { data: user } = await supabase
    .from('accounts')
    .select('userId')
    .eq('providerAccountId', broadcasterId)
    .single()

  if (!user) {
    console.log('twitch-events Failed to find user', broadcasterId)
    return
  }

  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .eq('userId', user?.userId)

  if (!settings) {
    console.log('twitch-events Failed to find settings', broadcasterId)
    return
  }

  if (settings.find((s) => s.key === 'commandDisable' && s.value === true)) {
    console.log('twitch-events User already disabled', broadcasterId)
    return
  }

  console.log('twitch-events Disabling user', broadcasterId)
  await supabase.from('settings').upsert(
    {
      userId: user.userId,
      key: 'commandDisable',
      value: true,
    },
    {
      onConflict: 'userId, key',
    },
  )
}

export async function getTwitchHeaders(): Promise<Record<string, string>> {
  const appToken = await getAppToken(
    process.env.TWITCH_CLIENT_ID || '',
    process.env.TWITCH_CLIENT_SECRET || '',
  )

  return {
    'Client-Id': process.env.TWITCH_CLIENT_ID || '',
    Authorization: `Bearer ${appToken?.accessToken}`,
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
  }
}

const headers = await getTwitchHeaders()

export async function fetchSubscriptions(providerId: string, cursor?: string): Promise<any> {
  const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
  url.searchParams.append('user_id', providerId)
  if (cursor) {
    url.searchParams.append('after', cursor)
  }

  const response = await fetch(url.toString(), { method: 'GET', headers })
  if (response.status !== 200) {
    console.error(
      `Failed to fetch subscriptions with providerId ${providerId}: ${
        response.status
      } // ${await response.text()}`,
    )
    return
  }
  const text = await response.json()
  if (Array.isArray(text.data)) {
    text.data = text.data.filter(
      (sub: any) =>
        (sub.condition.broadcaster_user_id || sub.condition.user_id) === `${providerId}`,
    )
  }
  return text
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Assuming this counter is defined outside of the deleteSubscription function
let fetchRequestCounter = 0
const maxRequestsBeforePause = 800
const pauseDuration = 65000 // 65 seconds in milliseconds

async function deleteSubscription(id: string) {
  let retryDelay = 60 // Start with a 60 second delay
  const maxRetries = 5 // Maximum number of retries
  let attempt = 0 // Current attempt

  while (attempt < maxRetries) {
    // Check if we need to pause before making the next request
    if (fetchRequestCounter % maxRequestsBeforePause === 0 && fetchRequestCounter !== 0) {
      console.log(`Pausing for ${pauseDuration / 1000} seconds to avoid rate limit...`)
      await sleep(pauseDuration) // Wait for 65 seconds
    }

    const response = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${id}`, {
      method: 'DELETE',
      headers,
    })

    fetchRequestCounter++ // Increment the request counter after each fetch

    const rateLimitRemaining = Number.parseInt(
      response.headers.get('ratelimit-remaining') || '0',
      10,
    )
    const rateLimitReset =
      Number.parseInt(response.headers.get('ratelimit-reset') || '0', 10) * 1000 // Convert to milliseconds
    const currentTime = Date.now()

    if (response.ok) {
      console.log('Delete rate limit:', rateLimitRemaining)
      return response // Exit function if request was successful
    }

    if (rateLimitRemaining === 0 && currentTime < rateLimitReset) {
      // Calculate wait time until rate limit reset, plus a small buffer
      const waitTime = rateLimitReset - currentTime + 100 // Adding a 100ms buffer
      console.log(`Rate limit exceeded. Waiting for ${waitTime}ms`)
      await sleep(waitTime) // Wait until rate limit is reset
      attempt++ // Increment attempt counter
      retryDelay *= 1.2 // Exponential back-off
    } else {
      // If the request failed for reasons other than rate limit, throw an error
      console.error(`Failed to delete subscription: ${response.status} // ${await response.text()}`)
    }
  }

  console.error('Exceeded maximum retry attempts for deleteSubscription')
}

async function deleteAllSubscriptionsForProvider(providerId: string): Promise<void> {
  let cursor: string | undefined
  do {
    // Fetch subscriptions for the given provider ID
    const subs = await fetchSubscriptions(providerId, cursor)
    console.log('Found subscriptions', subs.data.length)

    // Delete each subscription found for the provider
    for (const sub of subs.data) {
      await deleteSubscription(sub.id)
    }

    // Update cursor for next page of subscriptions, if any
    cursor = subs.pagination?.cursor
  } while (cursor) // Continue until there are no more pages

  console.log(`All subscriptions deleted for provider ID: ${providerId}`)
}

export async function revokeEvent(data: EventSubUserAuthorizationRevokeEvent) {
  console.log(`${data.userId} just revoked`)

  await deleteAllSubscriptionsForProvider(data.userId)

  await supabase
    .from('accounts')
    .update({
      requires_refresh: true,
    })
    .eq('providerAccountId', data.userId)

  await disableChannel(data.userId)
}
