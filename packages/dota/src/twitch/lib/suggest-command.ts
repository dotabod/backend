import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../settings'
import type { SettingKeys } from '../../settings'
import type { SocketClient } from '../../types'

export const commandClusters: readonly (readonly string[])[] = [
  ['today', 'lgs', 'wl'],
  ['np', 'gm', 'avg', 'smurfs', 'ranked'],
  ['mmr', 'profile', 'opendota', 'dotabuff'],
  ['hero', 'items', 'aghs', 'shard', 'innate', 'builds'],
  ['gpm', 'xpm', 'apm'],
  ['rosh', 'spectators', 'winprobability'],
]

const SUGGEST_EVERY = 4
const REPEAT_WINDOW_MS = 30 * 60 * 1000

const invocationCount = new Map<string, number>()
const lastSuggested = new Map<string, { cmd: string; ts: number }>()

interface SuggestionCommandOptions {
  name: string
  dbkey?: SettingKeys
  permission?: number
}

type LookupCommand = (name: string) => SuggestionCommandOptions | undefined

interface SuggestionMessage {
  channel: {
    client: Pick<SocketClient, 'locale' | 'subscription'>
    id: string
    settings: SocketClient['settings']
  }
}

const isCandidateEnabled = function isCandidateEnabled(
  candidate: string,
  lookup: LookupCommand,
  settings: SuggestionMessage['channel']['settings'],
  subscription: SuggestionMessage['channel']['client']['subscription']
): boolean {
  const command = lookup(candidate)
  if (command === undefined || (command.permission ?? 0) > 0) {
    return false
  }
  const { dbkey } = command
  return dbkey === undefined || Boolean(getValueOrDefault(dbkey, settings, subscription))
}

const pickCandidate = function pickCandidate(
  channelId: string,
  candidates: readonly string[],
  lookup: LookupCommand,
  settings: SuggestionMessage['channel']['settings'],
  subscription: SuggestionMessage['channel']['client']['subscription']
): string | null {
  const recent = lastSuggested.get(channelId)
  const now = Date.now()
  for (const candidate of candidates) {
    const wasRecentlySuggested =
      recent !== undefined && recent.cmd === candidate && now - recent.ts < REPEAT_WINDOW_MS
    if (!wasRecentlySuggested && isCandidateEnabled(candidate, lookup, settings, subscription)) {
      return candidate
    }
  }
  return null
}

export const prepareSuggestionSuffix = function prepareSuggestionSuffix(
  commandName: string,
  message: SuggestionMessage,
  lookup: LookupCommand
): string | null {
  const clusters = commandClusters.filter((cluster) =>
    cluster.some((name) => lookup(name)?.name === commandName)
  )
  const candidates = clusters.flat().filter((name) => lookup(name)?.name !== commandName)
  if (candidates.length === 0) {
    return null
  }

  const { channel } = message
  const suggestionsEnabled = getValueOrDefault(
    DBSettings.commandSuggestions,
    channel.settings,
    channel.client.subscription
  )
  if (!suggestionsEnabled) {
    return null
  }

  const count = (invocationCount.get(channel.id) ?? 0) + 1
  invocationCount.set(channel.id, count)
  if (count % SUGGEST_EVERY !== 0) {
    return null
  }

  const candidate = pickCandidate(
    channel.id,
    candidates,
    lookup,
    channel.settings,
    channel.client.subscription
  )
  if (candidate === null || candidate.length === 0) {
    return null
  }

  lastSuggested.set(channel.id, { cmd: candidate, ts: Date.now() })

  return t('commandSuggestion', {
    cmd: `!${candidate}`,
    lng: channel.client.locale,
  })
}

// Test-only reset of the in-memory throttle state.
export const _resetSuggestionState = function _resetSuggestionState(): void {
  invocationCount.clear()
  lastSuggested.clear()
}
