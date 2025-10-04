// Define the basic command types
export const defaultCommands = {
  commandAPM: true,
  commandAvg: true,
  commandCommands: true,
  commandDisable: false,
  commandDotabuff: true,
  commandGM: true,
  commandGPM: true,
  commandHero: true,
  commandLG: true,
  commandModsonly: true,
  commandNP: true,
  commandOpendota: true,
  commandPleb: true,
  commandRanked: true,
  commandSmurfs: true,
  commandProfile: true,
  commandLGS: true,
  commandSteam: true,
  commandWL: true,
  commandXPM: true,
  commandDelay: true,
  commandBuilds: true,
  commandMmr: true,
  commandRosh: true,
  commandItems: true,
  commandVersion: true,
  commandOnline: true,
  commandResetwl: true,
  commandLocale: true,
  commandSpectators: true,
  commandFacet: true,
  commandInnate: true,
  commandShard: true,
  commandAghs: true,
  commandWinProbability: true,
  commandFixparty: true,
  commandRefresh: true,
  commandSetmmr: true,
  commandBeta: true,
  commandPing: true,
  commandDotabod: true,
  commandMute: true,
  commandLastFm: false,
  commandOnly: true,
} as const

export type CommandKeys = keyof typeof defaultCommands

// Define the chatter types
export const defaultChatters = {
  midas: {
    enabled: true,
  },
  pause: {
    enabled: true,
  },
  smoke: {
    enabled: true,
  },
  passiveDeath: {
    enabled: true,
  },
  roshPickup: {
    enabled: true,
  },
  roshDeny: {
    enabled: true,
  },
  roshanKilled: {
    enabled: true,
  },
  tip: {
    enabled: true,
  },
  bounties: {
    enabled: true,
  },
  powerTreads: {
    enabled: true,
  },
  killstreak: {
    enabled: true,
  },
  firstBloodDeath: {
    enabled: true,
  },
  noTp: {
    enabled: true,
  },
  matchOutcome: {
    enabled: true,
  },
  commandsReady: {
    enabled: true,
  },
  neutralItems: {
    enabled: false,
  },
  dotapatch: {
    enabled: true,
  },
  chattingSpamEmote: {
    enabled: false,
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
    title: 'Will we win with [heroname]?',
    yes: 'Yes',
    no: 'No',
    duration: 4 * 60,
  },
  battlepass: false,
  chatter: true,
  chatters: defaultChatters,
  customMmr: '[currentmmr] | [currentrank] | Next rank at [nextmmr] [wins]',
  'minimap-blocker': true,
  minimapRight: false,
  mmr: null,
  'mmr-tracker': true,
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
  winProbabilityOverlay: false,
  advancedBets: false,
  winProbabilityOverlayIntervalMinutes: 5,
  tellChatNewMMR: true,
  tellChatBets: true,
  queueBlocker: false,
  queueBlockerFindMatch: false,
  queueBlockerFindMatchText: 'Ranked match / All pick / Europe East, Russia',
  showGiftAlerts: true,
  lastFmOverlay: false,
  lastFmUsername: '',
  lastFmRefreshRate: 30, // in seconds
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
for (const key of Object.keys(defaultSettingsStructure) as unknown as SettingKeys[]) {
  settingsKeys[key] = key
}
