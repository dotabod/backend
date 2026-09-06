import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { getRawSettingValue, getValueOrDefault } from '../../settings'
import type { SettingKeys } from '../../settings'
import type { SocketClient } from '../../types'
import type { SubscriptionRow } from '../../types/subscription'
import { canAccessFeature } from '../../utils/subscription'
import { chatClient } from '../chat-client'
import { prepareSuggestionSuffix, suggestionContext } from './suggest-command'

export interface UserType {
  name: string
  messageId: string
  permission: number
  userId: string
}

interface ChannelType {
  name: string
  id: string
  client: SocketClient
  settings: SocketClient['settings']
}

export interface MessageType {
  user: UserType
  content: string
  channel: ChannelType
}

export interface CommandOptions {
  aliases?: string[]
  permission?: number
  cooldown?: number
  onlyOnline?: boolean
  dbkey?: SettingKeys
  handler: (message: MessageType, args: string[], commandUsed: string) => Promise<void> | void
}

const defaultCooldown = 15_000

const parseMessage = function parseMessage(message: MessageType): string[] {
  const match = /^!(?<command>\w+=?)\s*(?<arguments>.*)/u.exec(
    message.content.replaceAll('\uDB40\uDC00', '')
  )
  const command = match?.groups?.command
  const argumentText = match?.groups?.arguments
  if (command === undefined || argumentText === undefined) {
    return []
  }

  const args = argumentText.match(/\S+|"[^"]+"/gu)
  if (args === null) {
    return [command.toLowerCase().trim()]
  }
  for (const [index, argument] of args.entries()) {
    if (argument.startsWith('"')) {
      args[index] = argument.slice(1, -1).trim()
    }
  }
  return [command.toLowerCase().trim(), ...args]
}

const isCommandEnabled = function isCommandEnabled(
  settings: SocketClient['settings'],
  dbkey?: SettingKeys,
  subscription?: SubscriptionRow
): boolean {
  if (dbkey === undefined) {
    return true
  }
  return Boolean(getValueOrDefault(dbkey, settings, subscription))
}

const isCommandEnabledRaw = function isCommandEnabledRaw(
  settings: SocketClient['settings'],
  dbkey?: SettingKeys
): boolean {
  if (dbkey === undefined) {
    return true
  }
  return Boolean(getRawSettingValue(dbkey, settings))
}

interface DisabledCommandContext {
  bypassUsers: readonly string[]
  commandEnabledRaw: boolean
  commandIsOnCooldown: boolean
  commandName: string
  message: MessageType
  options: CommandOptions
}

const shouldBlockDisabledCommand = function shouldBlockDisabledCommand({
  bypassUsers,
  commandEnabledRaw,
  commandIsOnCooldown,
  commandName,
  message,
  options,
}: DisabledCommandContext): boolean {
  if (bypassUsers.includes(message.user.name.toLowerCase())) {
    return false
  }
  if (options.dbkey !== undefined && commandEnabledRaw) {
    const { hasAccess } = canAccessFeature(options.dbkey, message.channel.client.subscription)
    if (!hasAccess && !commandIsOnCooldown) {
      chatClient.say(
        message.channel.name,
        t('subscriptionRequired', {
          channel: message.channel.client.name,
          command: `!${commandName}`,
          lng: message.channel.client.locale,
        }),
        message.user.messageId
      )
    }
  }
  return true
}

class CommandHandler {
  aliases = new Map<string, string>()
  // Map for storing command information
  commands = new Map<string, CommandOptions>()
  // Map for storing command cooldowns
  cooldowns = new Map<string, number>()
  // List of users that are allowed to bypass the cooldown
  bypassCooldownUsers: string[] = []
  readonly parseMessage = parseMessage

  constructor() {
    // Adjust this interval as needed
    const cleanupIntervalMinutes = 5
    // Convert to milliseconds
    const cleanupIntervalMillis = cleanupIntervalMinutes * 60 * 1000

    setInterval(this.cleanupCooldowns, cleanupIntervalMillis)
  }

  cleanupCooldowns = () => {
    const now = Date.now()
    for (const key of this.cooldowns.keys()) {
      const command = key.slice(key.indexOf('.') + 1)
      const cooldownTime = this.cooldowns.get(key)
      if (cooldownTime === undefined) {
        continue
      }
      const timeDiff = now - cooldownTime

      // Get the command cooldown from options or use defaultCooldown
      const commandOptions = this.commands.get(command)
      const cooldown = commandOptions?.cooldown ?? defaultCooldown

      // Remove the cooldown entry if it has expired
      if (timeDiff >= cooldown) {
        this.cooldowns.delete(key)
      }
    }
  }

  // Function for adding a user to the list of users that are allowed to bypass the cooldown
  addUserToBypassList(username: string | string[]) {
    if (Array.isArray(username)) {
      this.bypassCooldownUsers.push(...username.map((u) => u.toLowerCase()))
    } else {
      this.bypassCooldownUsers.push(username.toLowerCase())
    }
  }

  // Function for registering a new command
  registerCommand(commandName: string, options: CommandOptions) {
    // Check if the command is already registered
    if (this.commands.has(commandName)) {
      throw new Error(`Command "${commandName}" is already registered.`)
    }

    // Store the command information in the commands map
    this.commands.set(commandName, options)
    for (const alias of options.aliases ?? []) {
      if (this.aliases.has(alias)) {
        throw new Error(`Alias "${alias}" is already registered.`)
      }

      this.aliases.set(alias, commandName)
    }
  }

  // Function for handling incoming Twitch chat messages
  async handleMessage(message: MessageType) {
    // Parse the message to get the command and its arguments
    const [command, ...args] = this.parseMessage(message)

    // Check if the command is registered
    if (!this.commands.has(command) && !this.aliases.has(command)) {
      // Skip unregistered commands
      return
    }

    // Get the command options from the commands map
    let commandName = command
    if (this.aliases.has(command)) {
      commandName = this.aliases.get(command) ?? command
    }

    const options = this.commands.get(commandName)
    if (!options) {
      // Skip unregistered commands
      return
    }
    // Log statistics for this command
    // await this.logCommand(command, message)

    if (options.onlyOnline === true && !message.channel.client.stream_online) {
      chatClient.say(
        message.channel.name,
        t('notLive', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

    const commandEnabledRaw = isCommandEnabledRaw(message.channel.settings, options.dbkey)

    // Check if the command is enabled (via settings and subscription)
    const commandEnabled = isCommandEnabled(
      message.channel.settings,
      options.dbkey,
      message.channel.client.subscription
    )

    // Check if the command is currently on cooldown for this user/channel
    const commandIsOnCooldown = this.isOnCooldown(
      commandName,
      options.cooldown ?? defaultCooldown,
      message.user,
      message.channel.id
    )

    if (
      !commandEnabled &&
      shouldBlockDisabledCommand({
        bypassUsers: this.bypassCooldownUsers,
        commandEnabledRaw,
        commandIsOnCooldown,
        commandName,
        message,
        options,
      })
    ) {
      return
    }

    // If the command is enabled, but currently on cooldown
    if (commandIsOnCooldown) {
      // Silently return, command is on cooldown
      return
    }

    // Check if the user has the required permissions
    if (!this.hasPermission(message.user, options.permission ?? 0)) {
      // Skip commands for which the user lacks permission
      return
    }

    // Update the command cooldown
    this.updateCooldown(commandName, options.cooldown ?? defaultCooldown, message.channel.id)

    // Execute the command handler inside a scoped suffix context so the first
    // chatClient.say it emits can append a suggestion to the same chat line.
    const suffix = prepareSuggestionSuffix(commandName, message, this.commands)
    const runHandler = async () => {
      await options.handler(message, args, command)
    }
    await suggestionContext.run({ suffix }, runHandler)
  }

  // Function for checking if a command is on cooldown
  isOnCooldown(command: string, cooldown: number, user: UserType, channelId: string) {
    // Check if the user is on the list of users that are allowed to bypass the cooldown
    if (this.bypassCooldownUsers.includes(user.name.toLowerCase())) {
      // The command is not on cooldown for users that are allowed to bypass the cooldown
      return false
    }

    // Check if the command has a cooldown
    if (cooldown === 0) {
      // Commands with a cooldown of 0 are not on cooldown
      return false
    }

    const cooldownKey = `${channelId}.${command}`
    const cooldownStartedAt = this.cooldowns.get(cooldownKey)
    if (cooldownStartedAt === undefined) {
      // Set the initial cooldown time
      this.cooldowns.set(cooldownKey, Date.now())
      // The command is not on cooldown if it has not been used before
      return false
    }

    // Check if the command cooldown has expired
    const timeDiff = Date.now() - cooldownStartedAt
    if (timeDiff >= cooldown) {
      // Update the cooldown time
      this.cooldowns.set(cooldownKey, Date.now())
      // The command is not on cooldown if its cooldown has expired
      return false
    }

    // The command is on cooldown if none of the above conditions are met
    return true
  }

  // Function for updating the cooldown time for a command
  updateCooldown(command: string, cooldown: number, channelId: string) {
    // Check if the command has a cooldown
    if (cooldown === 0) {
      // Do not update the cooldown for commands with a cooldown of 0
      return
    }

    // Update the command cooldown time
    this.cooldowns.set(`${channelId}.${command}`, Date.now())
  }

  // Function for checking if a user has the required permission for a command
  hasPermission(user: UserType, permission: number) {
    // Check if the user is on the list of users that are allowed to bypass any restriction
    if (this.bypassCooldownUsers.includes(user.name.toLowerCase())) {
      return true
    }

    // Check if the user has the required permission level
    if (user.permission >= permission) {
      // The user has the required permission
      return true
    }

    // The user lacks the required permission
    return false
  }
}

const commandHandler = new CommandHandler()

// Add a user to the list of users that are allowed to bypass the cooldown
const { data } = await supabase.from('admin').select('users(name)').eq('role', 'admin')
const names = data?.map((user: { users: { name: string } | null }) => user.users?.name ?? '') ?? []
commandHandler.addUserToBypassList(names.filter(Boolean))

export default commandHandler
