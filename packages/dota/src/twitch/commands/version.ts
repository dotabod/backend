import { steamSocket, twitchChat, twitchEvents } from '../../steam/ws'
import { chatClient } from '../chat-client'
import type { CommandDefinition } from '../lib/command-handler.ts'
import { fetchSocketVersion, runVersionCommand } from './version-handler'
import type { VersionCommandDependencies } from './version-handler'

const versionCommandDependencies: VersionCommandDependencies = {
  getVersions: async () => {
    const [steam, twitchChatVersion, twitchEventsVersion] = await Promise.all([
      fetchSocketVersion(steamSocket),
      fetchSocketVersion(twitchChat),
      fetchSocketVersion(twitchEvents),
    ])
    return {
      dota: process.env.COMMIT_HASH ?? null,
      steam,
      twitchChat: twitchChatVersion,
      twitchEvents: twitchEventsVersion,
    }
  },
  say: (channel, text, messageId) => {
    chatClient.say(channel, text, messageId)
  },
}

export const versionCommand: CommandDefinition = {
  handler: async (message) => {
    await runVersionCommand(message, versionCommandDependencies)
  },
  name: 'version',
}
