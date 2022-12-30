import { DBSettings } from '../../db/settings.js'
import { modMode } from '../../dota/lib/consts.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('modsonly', {

  permission: 2,

  dbkey: DBSettings.commandModsonly,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message
    if (modMode.has(channelId)) {
      void chatClient.say(channel, 'Mods only mode disabled Sadge')
      modMode.delete(channelId)
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channelId)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(
      channel,
      'Mods only mode enabled BASED Clap. Type !modsonly again to disable.',
    )
  },
})
