export enum DBSettings {
  obs = 'obs-scene-switcher',
  xl = 'minimap-xl',
  simple = 'minimap-simple',
  mblock = 'minimap-blocker',
  pblock = 'picks-blocker',
  obsMinimap = 'obs-minimap',
  obsPicks = 'obs-picks',
  obsDc = 'obs-dc',
  onlyBlockRanked = 'only-block-ranked',
  mmrTracker = 'mmr-tracker',
  mmr = 'mmr',
  bp = 'battlepass',
  bets = 'bets',
  chatter = 'chatter',
  rosh = 'rosh',
  aegis = 'aegis',
  minimapRight = 'minimapRight',
  commandWL = 'commandWL',
  commandXPM = 'commandXPM',
  commandGPM = 'commandGPM',
  commandAPM = 'commandAPM',
  commandPleb = 'commandPleb',
  commandModsonly = 'commandModsonly',
  commandHero = 'commandHero',
  commandNP = 'commandNP',
  commandGM = 'commandGM',
  commandLG = 'commandLG',
  commandSmurfs = 'commandSmurfs',
  customMmr = 'customMmr',
  commandRanked = 'commandRanked',
  commandDisable = 'commandDisable',
  commandCommands = 'commandCommands',
  betsInfo = 'betsInfo',
}

export const defaultSettings = {
  [DBSettings.obs]: true,
  [DBSettings.simple]: false,
  [DBSettings.xl]: false,
  [DBSettings.mblock]: true,
  [DBSettings.pblock]: true,
  [DBSettings.mmrTracker]: true,
  [DBSettings.onlyBlockRanked]: true,
  [DBSettings.obsMinimap]: '[dotabod] blocking minimap',
  [DBSettings.obsPicks]: '[dotabod] blocking picks',
  [DBSettings.obsDc]: '[dotabod] game disconnected',
  [DBSettings.mmr]: null,
  [DBSettings.bp]: false,
  [DBSettings.bets]: true,
  [DBSettings.chatter]: true,
  [DBSettings.rosh]: true,
  [DBSettings.aegis]: true,
  [DBSettings.minimapRight]: false,
  [DBSettings.commandWL]: true,
  [DBSettings.commandXPM]: true,
  [DBSettings.commandGPM]: true,
  [DBSettings.commandAPM]: true,
  [DBSettings.commandPleb]: true,
  [DBSettings.commandModsonly]: true,
  [DBSettings.commandHero]: true,
  [DBSettings.commandNP]: true,
  [DBSettings.commandGM]: true,
  [DBSettings.commandLG]: true,
  [DBSettings.commandSmurfs]: true,
  [DBSettings.customMmr]: '[currentmmr] | [currentrank] | Next rank at [nextmmr] [wins]',
  [DBSettings.commandRanked]: true,
  [DBSettings.commandDisable]: false,
  [DBSettings.commandCommands]: true,
  [DBSettings.betsInfo]: {
    title: 'Will we win with [heroname]?',
    yes: 'Yes',
    no: 'No',
    duration: 4 * 60,
  },
}

export const getValueOrDefault = (key: DBSettings, data?: { key: string; value: any }[]) => {
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(dbVal)
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dbVal
  }
}
