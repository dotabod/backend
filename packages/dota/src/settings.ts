export const commands = {
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
}
export type CommandKeys = keyof typeof commands

export const defaultSettings = {
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
  chatters: {
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
  },
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
  winProbabilityOverlayIntervalMinutes: 5,
  tellChatNewMMR: true,
  tellChatBets: true,
  queueBlocker: false,
  queueBlockerFindMatch: false,
  queueBlockerFindMatchText: 'Ranked match / All pick / Europe East, Russia',
  ...commands,
}

export type SettingKeys = keyof typeof defaultSettings
export const DBSettings = {} as Record<SettingKeys, SettingKeys>
for (const key of Object.keys(defaultSettings)) {
  DBSettings[key as SettingKeys] = key as SettingKeys
}

export const getValueOrDefault = (key: SettingKeys, data?: { key: string; value: any }[]) => {
  if (!Array.isArray(data) || !data.length || !data.filter(Boolean).length) {
    return defaultSettings[key]
  }

  const dbVal = data.find((s) => s.key === key)?.value

  // Undefined is not touching the option in FE yet
  // So we give them our best default
  if (dbVal === undefined) {
    return defaultSettings[key]
  }

  try {
    if (typeof dbVal === 'string') {
      const val = JSON.parse(dbVal) as unknown as any
      if (typeof val === 'object' && typeof defaultSettings[key] === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return {
          ...(defaultSettings[key] as any),
          ...val,
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return val
    }

    if (typeof dbVal === 'object' && typeof defaultSettings[key] === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        ...(defaultSettings[key] as any),
        ...dbVal,
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dbVal
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dbVal
  }
}
