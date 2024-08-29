import debounce from 'lodash.debounce'
import supabase from '../../db/supabase.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
// Constants
const headers = await getTwitchHeaders()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchSubscriptionsWithStatus(status?: string, cursor?: string): Promise<any> {
  const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
  if (status) url.searchParams.append('status', status)
  if (cursor) {
    url.searchParams.append('after', cursor)
  }

  const response = await fetch(url.toString(), { method: 'GET', headers })
  console.log('rate-limit remaining: ', response.headers.get('ratelimit-remaining'))
  if (response.status !== 200) {
    console.error(
      `Failed to fetch subscriptions with status ${status}: ${
        response.status
      } // ${await response.text()}`,
    )
    return
  }
  return response.json()
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

const requireRefreshAccounts: Set<string> = new Set()
const debouncedUpdateAccounts = debounce(async () => {
  const twitchIds = Array.from(requireRefreshAccounts)
  if (twitchIds.length === 0) return

  console.log("Batch updating accounts' requires_refresh to true", { total: twitchIds.length })

  // Function to split the twitchIds array into chunks of 50
  const chunkSize = 50
  const chunks = []
  for (let i = 0; i < twitchIds.length; i += chunkSize) {
    chunks.push(twitchIds.slice(i, i + chunkSize))
  }

  // Process each chunk
  for (const chunk of chunks) {
    const { error } = await supabase
      .from('accounts')
      .update({ requires_refresh: true })
      .in('providerAccountId', chunk)
      .eq('provider', 'twitch')

    if (error) {
      console.error('Failed to update accounts', error)
      return
      // Consider how to handle partial failures - retry logic, logging, etc.
    }
  }

  // Clear the set after all updates
  requireRefreshAccounts.clear()
}, 500) // Adjust debounce time as needed

async function updateAccountRequiresRefresh(twitchId: string) {
  if (requireRefreshAccounts.has(twitchId)) return
  requireRefreshAccounts.add(twitchId)

  // Call the debounced function
  return debouncedUpdateAccounts()
}

async function markRevokedAuthorizationsAsRequiresRefresh(singleLoop = false) {
  const statuses = ['user_removed', 'authorization_revoked']
  const updatePromises = new Map()

  for (const status of statuses) {
    let cursor: string | undefined
    do {
      try {
        const data = await fetchSubscriptionsWithStatus(status, cursor)
        console.log(
          `Found subscriptions with status ${status} that require deletion:`,
          data.data.length,
        )

        for (const sub of data.data) {
          const twitchId = sub.condition.broadcaster_user_id
          await deleteSubscription(sub.id)

          if (!updatePromises.has(twitchId)) {
            updatePromises.set(twitchId, updateAccountRequiresRefresh(twitchId))
          }
        }

        await Promise.all(Array.from(updatePromises.values()))
        cursor = data.pagination.cursor

        if (singleLoop) break
      } catch (error) {
        console.error(error)
        break
      }
    } while (cursor)

    if (singleLoop) break
  }
}

async function deleteStatuses(singleLoop = false) {
  const statuses = ['user_removed', 'authorization_revoked', 'webhook_callback_verification_failed']

  for (const status of statuses) {
    let cursor: string | undefined
    do {
      try {
        const data = await fetchSubscriptionsWithStatus(status, cursor)
        console.log(
          `Found subscriptions with status ${status} that require deletion:`,
          data.data.length,
        )

        for (const sub of data.data) {
          await deleteSubscription(sub.id)
        }

        cursor = data.pagination.cursor

        if (singleLoop) break
      } catch (error) {
        console.error(error)
        break
      }
    } while (cursor)

    if (singleLoop) break
  }
}

async function getCountOfSubscriptionsWithStatus(status?: string): Promise<number> {
  try {
    const data = await fetchSubscriptionsWithStatus(status)
    console.log('max total cost: ', data?.max_total_cost)
    console.log('total cost: ', data?.total_cost)
    console.log('total found: ', data?.data.length)
    return data.data.length
  } catch (error) {
    console.error(error)
    return 0
  }
}

async function deleteCostSubsAndSetRequiresRefresh(singleLoop = false): Promise<any[]> {
  const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
  let allBroadcasterUserIds: string[] = []
  let cursor: string | null = null
  const subsetsOfBroadcasterUserIds: string[][] = [] // Track subsets
  const subIdMap: Record<string, string[]> = {} // Map providerAccountId to sub ids

  console.log("Retrieving subscriptions with 'cost' above zero...")

  let pageCount = 0
  do {
    console.log('Fetching page:', pageCount)
    if (cursor) {
      url.searchParams.set('after', cursor)
    }

    const response = await fetch(url.toString(), { method: 'GET', headers })
    if (response.status !== 200) {
      console.error(`Failed to fetch subscriptions: ${response.status} // ${await response.text()}`)
      return []
    }

    const data = await response.json()
    const subscriptionsWithCostAboveZero = data.data.filter((sub: any) => sub.cost > 0)
    const broadcasterUserIds = subscriptionsWithCostAboveZero.map(
      (sub: any) => sub.condition.broadcaster_user_id || sub.condition.user_id,
    )
    allBroadcasterUserIds = allBroadcasterUserIds.concat(broadcasterUserIds)

    subsetsOfBroadcasterUserIds.push(broadcasterUserIds)

    // Save sub ids to subIdMap
    subscriptionsWithCostAboveZero.forEach((sub: any) => {
      const broadcasterUserId = sub.condition.broadcaster_user_id || sub.condition.user_id
      if (!subIdMap[broadcasterUserId]) {
        subIdMap[broadcasterUserId] = []
      }
      subIdMap[broadcasterUserId].push(sub.id)
    })

    pageCount++
    if (singleLoop) break
    cursor = data.pagination.cursor
  } while (cursor)

  console.log("Found subscriptions with 'cost' above zero:", allBroadcasterUserIds.length)

  const updateRefreshPromises: Promise<any>[] = []
  const deleteSubPromises: Promise<any>[] = []

  for (const providerAccountId of allBroadcasterUserIds) {
    if (providerAccountId) {
      updateRefreshPromises.push(updateAccountRequiresRefresh(providerAccountId))
      const subIdsToDelete = subIdMap[providerAccountId] || []
      subIdsToDelete.forEach((subId) => {
        deleteSubPromises.push(deleteSubscription(subId))
      })
    }
  }

  console.log('Deleting: ', deleteSubPromises.length)
  console.log('Updating: ', updateRefreshPromises.length)

  await Promise.all(updateRefreshPromises)
  await Promise.all(deleteSubPromises)

  return allBroadcasterUserIds
}

// await deleteCostSubsAndSetRequiresRefresh()
// await deleteStatuses()
await getCountOfSubscriptionsWithStatus()
