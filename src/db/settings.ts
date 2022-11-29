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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return dbVal
}
