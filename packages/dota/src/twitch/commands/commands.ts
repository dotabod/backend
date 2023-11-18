import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('commands', {
  dbkey: DBSettings.commandCommands,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel },
    } = message
    // Find commands where we have user permission
    const filtered = [...commandHandler.commands]
      .filter(([k, v]) => (v.permission ?? 0) <= message.user.permission)
      .filter(([k, v]) => {
        if (v.dbkey) {
          return getValueOrDefault(v.dbkey, message.channel.settings)
        }
        return true
      })
      .map(([k, v]) => ({
        command: k,
        permission: v.permission ?? 0,
      }))
      .sort((a, b) => a.command.localeCompare(b.command))

    const everyone = filtered.filter((v) => v.permission === 0).map((v) => `!${v.command}`)
    const others = filtered.filter((v) => v.permission > 0).map((v) => `!${v.command}`)

    chatClient.say(
      message.channel.name,
      t('commands', {
        context: 'everyone',
        commandList: everyone.join(' · '),
        lng: message.channel.client.locale,
      }),
    )

    if (others.length === 0) return
    chatClient.say(
      message.channel.name,
      t('commands', {
        context: 'mods',
        commandList: others.join(' · '),
        lng: message.channel.client.locale,
      }),
    )
  },
})
