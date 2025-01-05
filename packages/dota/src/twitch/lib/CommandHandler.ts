import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import { type SettingKeys, getValueOrDefault } from '../../settings.js'
import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import type { SocketClient } from '../../types.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'

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

const defaultCooldown = 15000

class CommandHandler {
  aliases = new Map<string, string>()
  commands = new Map<string, CommandOptions>() // Map for storing command information
  cooldowns = new Map() // Map for storing command cooldowns
  bypassCooldownUsers: string[] = [] // List of users that are allowed to bypass the cooldown

  constructor() {
    const cleanupIntervalMinutes = 5 // Adjust this interval as needed
    const cleanupIntervalMillis = cleanupIntervalMinutes * 60 * 1000 // Convert to milliseconds

    setInterval(this.cleanupCooldowns, cleanupIntervalMillis)
  }

  cleanupCooldowns = () => {
    const now = Date.now()
    for (const key of this.cooldowns.keys()) {
      const [, command] = key.split('.')
      const cooldownTime = this.cooldowns.get(key)
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

  async logCommand(commandName: string, message: MessageType) {
    // Log statistics for this command
    const {
      channel: { name: channel, id: channelId },
    } = message
    const command = commandName.toLowerCase()

    // current date in yyyy-mm-dd format
    const date = new Date().toISOString().slice(0, 10)
    const data = {
      date,
      channelId,
      channel,
      command,
    }

    const mongo = MongoDBSingleton
    const db = await mongo.connect()

    try {
      await db.collection('commandstats').updateOne(
        { command, channel, date },
        {
          $set: data,
          $inc: {
            count: 1,
          },
        },
        { upsert: true },
      )
    } catch (e) {
      logger.error('Error in commandstats update', { e })
    } finally {
      await mongo.close()
    }
  }

  // Function for handling incoming Twitch chat messages
  async handleMessage(message: MessageType) {
    // Parse the message to get the command and its arguments
    const [command, ...args] = this.parseMessage(message)

    // Check if the command is registered
    if (!this.commands.has(command) && !this.aliases.has(command)) {
      return // Skip unregistered commands
    }

    // Get the command options from the commands map
    let commandName = command
    if (this.aliases.has(command)) {
      commandName = this.aliases.get(command)!
    }

    const options = this.commands.get(commandName)
    if (!options) return

    // Log statistics for this command
    // await this.logCommand(command, message)

    if (options.onlyOnline && !message.channel.client.stream_online) {
      chatClient.say(
        message.channel.name,
        t('notLive', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    // Check if the command is enabled
    if (!this.isEnabled(message.channel.settings, options.dbkey)) {
      return
    }

    // Check if the command is on cooldown
    if (
      this.isOnCooldown(
        commandName,
        options.cooldown ?? defaultCooldown,
        message.user,
        message.channel.id,
      )
    ) {
      return // Skip commands that are on cooldown
    }

    // Check if the user has the required permissions
    if (!this.hasPermission(message.user, options.permission ?? 0)) {
      return // Skip commands for which the user lacks permission
    }

    // Update the command cooldown
    this.updateCooldown(commandName, options.cooldown ?? defaultCooldown, message.channel.id)

    // Execute the command handler
    await options.handler(message, args, command)
  }

  // Function for parsing a Twitch chat message to extract the command and its arguments
  parseMessage(message: MessageType) {
    // Use a regular expression to match the command and its arguments
    // `/\uDB40\uDC00/g` is unicode empty space that 7tv adds to spam a command
    const match = message.content.replace(/\uDB40\uDC00/g, '').match(/^!(\w+=?)\s*(.*)/)

    if (!match) {
      return [] // Return an empty array if the message is not a command
    }

    // Split the arguments on spaces, while taking into account quoted strings
    const args = match[2].match(/\S+|"[^"]+"/g)
    if (args === null) {
      return [match[1].toLowerCase().trim()] // Return the command if there are no arguments
    }

    // Strip the quotes from the quoted arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('"')) {
        args[i] = args[i].slice(1, -1).trim()
      }
    }

    // Return the command and its arguments
    return [match[1].toLowerCase().trim(), ...args]
  }

  // Function for checking if a command is on cooldown
  isOnCooldown(command: string, cooldown: number, user: UserType, channelId: string) {
    // Check if the user is on the list of users that are allowed to bypass the cooldown
    if (this.bypassCooldownUsers.includes(user.name.toLowerCase())) {
      return false // The command is not on cooldown for users that are allowed to bypass the cooldown
    }

    // Check if the command has a cooldown
    if (cooldown === 0) {
      return false // Commands with a cooldown of 0 are not on cooldown
    }

    // Check if the command has been used recently
    if (!this.cooldowns.has(`${channelId}.${command}`)) {
      this.cooldowns.set(`${channelId}.${command}`, Date.now()) // Set the initial cooldown time
      return false // The command is not on cooldown if it has not been used before
    }

    // Check if the command cooldown has expired
    const timeDiff = Date.now() - this.cooldowns.get(`${channelId}.${command}`)
    if (timeDiff >= cooldown) {
      this.cooldowns.set(`${channelId}.${command}`, Date.now()) // Update the cooldown time
      return false // The command is not on cooldown if its cooldown has expired
    }

    return true // The command is on cooldown if none of the above conditions are met
  }

  isEnabled(settings: SocketClient['settings'], dbkey?: SettingKeys) {
    // Default enabled if no dbkey is provided
    if (!dbkey) return true

    return !!getValueOrDefault(dbkey, settings)
  }

  // Function for updating the cooldown time for a command
  updateCooldown(command: string, cooldown: number, channelId: string) {
    // Check if the command has a cooldown
    if (cooldown === 0) {
      return // Do not update the cooldown for commands with a cooldown of 0
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
      return true // The user has the required permission
    }

    return false // The user lacks the required permission
  }
}

const commandHandler = new CommandHandler()

// Add a user to the list of users that are allowed to bypass the cooldown
const { data } = await supabase.from('admin').select('users(name)').eq('role', 'admin')
const names = data?.map((user) => user.users?.name ?? '') ?? []
commandHandler.addUserToBypassList(names.filter(Boolean))

export default commandHandler
