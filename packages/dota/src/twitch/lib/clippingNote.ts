import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../../settings'
import type { Players, SocketClient } from '../../types'
import { is8500Plus } from '../../utils/index'

// 8500+/Immortal games have no Valve realtime roster, so commands like !np, !gm
// and !avg get their hero & rank data solely from the auto-clip vision pipeline
// (see map.game_state.ts — clips are only created for 8500+ players). If the
// streamer turned auto-clipping off there's nothing to show, so return a short
// viewer-facing note explaining why; otherwise ''.
export function clippingDisabledNote(client: SocketClient, matchPlayers: Players): string {
  const disabled = getValueOrDefault(
    DBSettings.disableAutoClipping,
    client.settings,
    client.subscription,
  )
  if (!disabled || !is8500Plus(client)) return ''

  // Only count OTHER players' heroes: when no roster is available
  // MatchDataService falls back to a single gsi-self player carrying the
  // streamer's own hero id, which would otherwise look like a real roster and
  // wrongly suppress the note (the exact no-clips case this note is for).
  const hasOtherPlayers = matchPlayers.some(
    (player) => (player.heroid ?? 0) > 0 && Number(player.accountid) !== client.steam32Id,
  )
  if (hasOtherPlayers) return ''

  return t('clippingDisabled', { lng: client.locale })
}

// Append the note as a " · " postfix when present.
export function withClippingNote(text: string, note: string): string {
  return note ? `${text} · ${note}` : text
}
