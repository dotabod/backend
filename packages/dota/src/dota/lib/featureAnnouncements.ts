import type { SettingKeys } from '../../settings'
import type { GSIHandlerType } from '../GSIHandlerTypes'

// One announceable feature. `id` is shared by convention with the frontend `whatsNew`
// registry (same hand-kept discipline as setting keys, since the two repos have no shared
// package). The announcer (announceFeatures.ts) fires the chat copy once per streamer at the
// relevant in-game moment, gated by the master / per-feature toggles.
export interface FeatureAnnouncement {
  id: string
  // GSI event to announce on, e.g. 'hero:id' (pick), 'map:game_state' (match start),
  // 'player:deaths' (first blood). Multiple features can share a trigger.
  trigger: string
  // Optional extra condition on the event payload (e.g. game_state === GAME_IN_PROGRESS).
  when?: (dotaClient: GSIHandlerType, data: unknown) => boolean
  // Per-feature tri-state toggle; effective = (value ?? autoOptInNewFeatures). Omit to gate
  // on the master toggle alone.
  gateSettingKey?: SettingKeys
  // i18n key for the chat message (authored with the opt-out framing + {{- url}}).
  messageKey: string
  releaseDate: string // ISO; mirrors the frontend entry, handy for future grace windows
}

export const FEATURE_ANNOUNCEMENTS: FeatureAnnouncement[] = [
  {
    id: 'cosmetics',
    trigger: 'hero:id',
    gateSettingKey: 'cosmeticsAnnounce',
    messageKey: 'newFeatures.announce.cosmetics',
    releaseDate: '2026-06-10',
  },
]
