import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../settings'
import type { SettingKeys } from '../../settings'
import type { SocketClient } from '../../types'

export { suggestionContext } from './suggestion-context'

// The declarative API: group related commands together. Each command's
// suggestions are the other members of any cluster it appears in.
// Adding a relation is a one-line edit — append to a cluster or add a new one.
// Use canonical command names only (aliases are normalized before lookup).
// Exported for the no-mod-commands guard test in __tests__/suggestCommand.test.ts.
export const commandClusters: readonly (readonly string[])[] = [
  ['today', 'lgs', 'wl'],
  ['np', 'gm', 'avg', 'smurfs', 'ranked'],
  ['mmr', 'profile', 'opendota', 'dotabuff'],
  ['hero', 'items', 'aghs', 'shard', 'innate', 'builds'],
  ['gpm', 'xpm', 'apm'],
  ['rosh', 'spectators', 'winprobability'],
]

const relatedIndex: ReadonlyMap<string, readonly string[]> = (() => {
  const acc = new Map<string, string[]>()
  for (const cluster of commandClusters) {
    for (const cmd of cluster) {
      const list = acc.get(cmd) ?? []
      for (const sibling of cluster) {
        if (sibling !== cmd && !list.includes(sibling)) {
          list.push(sibling)
        }
      }
      acc.set(cmd, list)
    }
  }
  return acc
})()

// Show a suggestion every Nth invocation per channel so the hint is visible
// but not spammy. 4 → roughly once every four commands.
const SUGGEST_EVERY = 4
// Don't repeat the same suggestion to a channel within this window.
const REPEAT_WINDOW_MS = 30 * 60 * 1000

const invocationCount = new Map<string, number>()
const lastSuggested = new Map<string, { cmd: string; ts: number }>()

interface SuggestionCommandOptions {
  dbkey?: SettingKeys
}

interface SuggestionMessage {
  channel: {
    client: Pick<SocketClient, 'locale' | 'subscription'>
    id: string
    settings: SocketClient['settings']
  }
}

const isCandidateEnabled = function isCandidateEnabled(
  candidate: string,
  commands: ReadonlyMap<string, SuggestionCommandOptions>,
  settings: SuggestionMessage['channel']['settings'],
  subscription: SuggestionMessage['channel']['client']['subscription']
): boolean {
  const dbkey = commands.get(candidate)?.dbkey
  return dbkey === undefined || Boolean(getValueOrDefault(dbkey, settings, subscription))
}

const pickCandidate = function pickCandidate(
  channelId: string,
  candidates: readonly string[],
  commands: ReadonlyMap<string, SuggestionCommandOptions>,
  settings: SuggestionMessage['channel']['settings'],
  subscription: SuggestionMessage['channel']['client']['subscription']
): string | null {
  const recent = lastSuggested.get(channelId)
  const now = Date.now()
  for (const candidate of candidates) {
    const wasRecentlySuggested =
      recent !== undefined && recent.cmd === candidate && now - recent.ts < REPEAT_WINDOW_MS
    if (!wasRecentlySuggested && isCandidateEnabled(candidate, commands, settings, subscription)) {
      return candidate
    }
  }
  return null
}

// Decides whether the current command invocation should carry a suggestion
// suffix. Returns the localized suffix string (without leading separator) or
// null. CommandHandler runs the handler inside `suggestionContext.run({ suffix })`
// so chatClient.say can consume it.
export const prepareSuggestionSuffix = function prepareSuggestionSuffix(
  commandName: string,
  message: SuggestionMessage,
  commands: ReadonlyMap<string, SuggestionCommandOptions>
): string | null {
  const candidates = relatedIndex.get(commandName)
  if (candidates === undefined || candidates.length === 0) {
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
    commands,
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
