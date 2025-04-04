import supabase from './db/supabase'
// Cache to store tokens with provider ID as key
const tokenCache = new Map<
  string,
  {
    data: any
    promise: Promise<any> | null
    timestamp: number
  }
>()

// Debounce time (3 seconds)
const DEBOUNCE_TIME = 3000

// Define the return type for the tokens
type TwitchTokens = {
  refresh_token: string
  requires_refresh: boolean
  access_token: string
  expires_in: number
  scope: string
  obtainment_timestamp: string
}

export async function getTwitchTokens(providerId?: string): Promise<TwitchTokens | null> {
  const lookupProviderId = providerId || process.env.TWITCH_BOT_PROVIDERID

  if (!lookupProviderId) throw new Error('Missing bot provider id (TWITCH_BOT_PROVIDERID)')

  const now = Date.now()
  const cachedItem = tokenCache.get(lookupProviderId)

  // If we have a recent request in progress, return its promise
  if (cachedItem?.promise && now - cachedItem.timestamp < DEBOUNCE_TIME) {
    return cachedItem.promise
  }

  // Create a new promise for this request
  const fetchPromise = (async () => {
    // If we have cached data, return it
    if (cachedItem?.data) {
      return cachedItem.data
    }

    // Otherwise fetch from database
    const { data, error } = await supabase
      .from('accounts')
      .select(
        'refresh_token, requires_refresh, access_token, expires_in, scope, obtainment_timestamp',
      )
      .eq('provider', 'twitch')
      .eq('providerAccountId', lookupProviderId)
      .single()

    if (error) {
      console.error(error)
      throw new Error('Error fetching bot tokens')
    }

    // Update cache with the actual data
    tokenCache.set(lookupProviderId, {
      data,
      promise: null,
      timestamp: now,
    })

    return data
  })()

  // Store the promise in the cache
  tokenCache.set(lookupProviderId, {
    data: cachedItem?.data || null,
    promise: fetchPromise,
    timestamp: now,
  })

  return fetchPromise
}
