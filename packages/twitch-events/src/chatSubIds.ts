import type { TwitchEventSubResponse } from './interfaces'

// Get all existing subscriptions by looping through pages

export const chatSubIds: Record<string, TwitchEventSubResponse['data'][0]> = {}
