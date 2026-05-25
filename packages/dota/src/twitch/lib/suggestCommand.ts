import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../../settings'
import commandHandler, { type MessageType } from './CommandHandler'
import { suggestionContext } from './suggestionContext'

export { suggestionContext }

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
        if (sibling !== cmd && !list.includes(sibling)) list.push(sibling)
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

function pickCandidate(
  channelId: string,
  candidates: readonly string[],
  settings: MessageType['channel']['settings'],
  subscription: MessageType['channel']['client']['subscription'],
): string | null {
  const recent = lastSuggested.get(channelId)
  const now = Date.now()
  for (const candidate of candidates) {
    if (recent && recent.cmd === candidate && now - recent.ts < REPEAT_WINDOW_MS) continue
    const dbkey = commandHandler.commands.get(candidate)?.dbkey
    if (dbkey && !getValueOrDefault(dbkey, settings, subscription)) continue
    return candidate
  }
  return null
}

// Decides whether the current command invocation should carry a suggestion
// suffix. Returns the localized suffix string (without leading separator) or
// null. CommandHandler runs the handler inside `suggestionContext.run({ suffix })`
// so chatClient.say can consume it.
export function prepareSuggestionSuffix(commandName: string, message: MessageType): string | null {
  const candidates = relatedIndex.get(commandName)
  if (!candidates?.length) return null

  const { channel } = message
  const suggestionsEnabled = getValueOrDefault(
    DBSettings.commandSuggestions,
    channel.settings,
    channel.client.subscription,
  )
  if (!suggestionsEnabled) return null

  const count = (invocationCount.get(channel.id) ?? 0) + 1
  invocationCount.set(channel.id, count)
  if (count % SUGGEST_EVERY !== 0) return null

  const candidate = pickCandidate(
    channel.id,
    candidates,
    channel.settings,
    channel.client.subscription,
  )
  if (!candidate) return null

  lastSuggested.set(channel.id, { cmd: candidate, ts: Date.now() })

  return t('commandSuggestion', {
    cmd: `!${candidate}`,
    lng: channel.client.locale,
  })
}

// Test-only reset of the in-memory throttle state.
export function _resetSuggestionState(): void {
  invocationCount.clear()
  lastSuggested.clear()
}
