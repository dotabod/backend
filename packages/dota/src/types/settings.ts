// Define the basic command types
const defaultCommands = {
  commandAPM: true,
  commandAghs: true,
  commandAvg: true,
  commandBeta: true,
  commandBuilds: true,
  commandCommands: true,
  commandDelay: true,
  commandDisable: false,
  commandDotabod: true,
  commandDotabuff: true,
  commandFixparty: true,
  commandGM: true,
  commandGPM: true,
  commandGeo: true,
  commandHero: true,
  commandInnate: true,
  commandItems: true,
  commandLG: true,
  commandLGS: true,
  commandLastFm: false,
  commandLocale: true,
  commandLost: true,
  commandMmr: true,
  commandModsonly: true,
  commandMute: true,
  commandNP: true,
  commandOnline: true,
  commandOnly: true,
  commandOpendota: true,
  commandPing: true,
  commandPleb: true,
  commandProfile: true,
  commandRanked: true,
  commandRefresh: true,
  commandResetwl: true,
  commandRosh: true,
  commandSet: true,
  commandSetmmr: true,
  commandShard: true,
  commandSmurfs: true,
  commandSpectators: true,
  commandSteam: true,
  commandStreamers: true,
  commandSuggestions: true,
  commandToday: true,
  commandVersion: true,
  commandWL: true,
  commandWinProbability: true,
  commandWon: true,
  commandXPM: true,
} as const

// Define the chatter types
const defaultChatters = {
  bounties: {
    enabled: true,
  },
  chattingSpamEmote: {
    enabled: false,
  },
  commandsReady: {
    enabled: true,
  },
  dotapatch: {
    enabled: true,
  },
  firstBloodDeath: {
    enabled: true,
  },
  killstreak: {
    enabled: true,
  },
  matchOutcome: {
    enabled: true,
  },
  midas: {
    enabled: true,
  },
  neutralItems: {
    enabled: false,
  },
  noTp: {
    enabled: true,
  },
  passiveDeath: {
    enabled: true,
  },
  pause: {
    enabled: true,
  },
  powerTreads: {
    enabled: true,
  },
  roshDeny: {
    enabled: true,
  },
  roshPickup: {
    enabled: true,
  },
  roshanKilled: {
    enabled: true,
  },
  smoke: {
    enabled: true,
  },
  tip: {
    enabled: true,
  },
} as const

export type ChatterKeys = keyof typeof defaultChatters
export type ChatterSettingKeys = `chatters.${ChatterKeys}`

// Define the default settings structure
export const defaultSettingsStructure = {
  obsServerPassword: '',
  obsServerPort: 4455,
  aegis: true,
  bets: true,
  betsInfo: {
    duration: 4 * 60,
    no: 'No',
    title: 'Will we win with [heroname]?',
    yes: 'Yes',
  },
  battlepass: false,
  chatter: true,
  chatters: defaultChatters,
  // Master switch: when on (default), features released after a streamer's last
  // visit are enabled by default. Per-feature settings (e.g. cosmeticsAnnounce)
  // override this once explicitly set. See isNewFeatureEnabled-style gating.
  autoOptInNewFeatures: true,
  // New-feature toggle for cosmetic-set announcements. null = follow
  // autoOptInNewFeatures; true/false = explicit streamer choice (always wins).
  cosmeticsAnnounce: null as boolean | null,
  // New-feature toggle for the "team smoked without you" FOMO roast. Same tri-state
  // as cosmeticsAnnounce: null = follow autoOptInNewFeatures; true/false = explicit choice.
  smokeActivated: null as boolean | null,
  customMmr: '[currentmmr] | [currentrank] | Next rank at [nextmmr] [wins]',
  'minimap-blocker': true,
  minimapRight: false,
  mmr: null,
  'mmr-tracker': true,
  // A duration and start date together define a fixed challenge window.
  wlStatsDays: null as number | null,
  wlStatsStartDate: null as string | null,
  'obs-scene-switcher': true,
  'obs-dc': '[dotabod] game disconnected',
  'obs-minimap': '[dotabod] blocking minimap',
  'obs-picks': '[dotabod] blocking picks',
  'only-block-ranked': true,
  'picks-blocker': true,
  rosh: true,
  'minimap-simple': false,
  'minimap-xl': false,
  'minimap-opacity': 0.7,
  onlyParty: false,
  livePolls: true,
  streamDelay: 0,
  showRankMmr: true,
  showRankImage: true,
  showRankLeader: true,
  notablePlayersOverlay: true,
  notablePlayersOverlayFlags: true,
  notablePlayersOverlayFlagsCmd: true,
  streamersNpSuffix: false,
  streamersAnnounce: false,
  winProbabilityOverlay: false,
  advancedBets: false,
  discardZeroBets: false,
  winProbabilityOverlayIntervalMinutes: 5,
  tellChatNewMMR: true,
  tellChatBets: true,
  queueBlocker: false,
  queueBlockerFindMatch: false,
  queueBlockerFindMatchText: 'Ranked match / All pick / Europe East, Russia',
  showGiftAlerts: true,
  lastFmOverlay: false,
  lastFmUsername: '',
  // in seconds
  lastFmRefreshRate: 30,
  disableAutoClipping: false,
  autoTranslate: false,
  translationLanguage: 'en',
  crypto_payment_interest: {
    interested: false,
    tier: 'PRO',
    transactionType: 'RECURRING',
  },
  rankOnly: {
    enabled: false,
    minimumRank: 'Herald',
    minimumRankTier: 0,
  },
  translateOnOverlay: false,
  autoCommandsOnMatchStart: [],
  ...defaultCommands,
} as const

export type SettingKeys = keyof typeof defaultSettingsStructure

export const settingsKeys = {} as Record<SettingKeys, SettingKeys>
for (const key of Object.keys(defaultSettingsStructure) as SettingKeys[]) {
  settingsKeys[key] = key
}
