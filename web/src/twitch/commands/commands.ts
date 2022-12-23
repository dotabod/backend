import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('commands', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  dbkey: DBSettings.commandCommands,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel },
    } = message
    // TODO: respond only with commands that are enabled for the channel
    // TODO: only commands user can use

    // Find commands where we have user permission
    const filtered = [...commandHandler.commands]
      .filter(([k, v]) => v.permission <= message.user.permission)
      .filter(([k, v]) => {
        if (v.dbkey) {
          return getValueOrDefault(v.dbkey, message.channel.settings)
        }
        return true
      })
      .map(([k, v]) => ({
        command: k,
        permission: v.permission,
      }))
      .sort((a, b) => a.command.localeCompare(b.command))

    const everyone = filtered.filter((v) => v.permission === 0).map((v) => v.command)
    const others = filtered.filter((v) => v.permission > 0).map((v) => v.command)

    void chatClient.say(channel, `Everyone can use: ${everyone.join(' · ')}.`)

    if (others.length === 0) return
    void chatClient.say(channel, `Mod only commands: ${others.join(' · ')}.`)
  },
})
