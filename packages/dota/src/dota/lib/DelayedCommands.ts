import { DBSettings, SettingKeys } from '@dotabod/settings'

export const DelayedCommands: { command: string; key: SettingKeys }[] = [
  {
    command: '!np',
    key: DBSettings.commandNP,
  },
  {
    command: '!smurfs',
    key: DBSettings.commandSmurfs,
  },
  {
    command: '!gm',
    key: DBSettings.commandGM,
  },
  {
    command: '!lg',
    key: DBSettings.commandLG,
  },
  {
    command: '!avg',
    key: DBSettings.commandAvg,
  },
  {
    command: '!items',
    key: DBSettings.commandItems,
  },
  {
    command: '!wp',
    key: DBSettings.commandWinProbability,
  },
]
