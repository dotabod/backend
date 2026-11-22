import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { DBSettings, getRawSettingValue, getValueOrDefault } from '../../settings.js'
import type { SettingKeys } from '../../settings.js'
import type { SocketClient } from '../../types'
import { canAccessFeature } from '../../utils/subscription.js'
import { chatClient } from '../chat-client.js'
import { commandContext } from './command-context.js'
import { prepareSuggestionSuffix } from './suggest-command.js'

interface UserType {
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

export interface CommandDefinition {
  name: string
  aliases?: string[]
  permission?: number
  cooldown?: number
  onlyOnline?: boolean
  allowWhenDisabled?: boolean
  dbkey?: SettingKeys
  handler: (message: MessageType, args: string[], commandUsed: string) => Promise<void> | void
}

const DEFAULT_COOLDOWN_MS = 15_000
const COOLDOWN_CLEANUP_MS = 5 * 60 * 1000

const parseMessage = function parseMessage(content: string): string[] {
  const match = /^!(?<command>\w+[=%]?)\s*(?<arguments>.*)/u.exec(
    content.replaceAll('\uDB40\uDC00', '')
  )
  const command = match?.groups?.command
  const argumentText = match?.groups?.arguments
  if (command === undefined || argumentText === undefined) {
    return []
  }

  const args = argumentText.match(/\S+|"[^"]+"/gu) ?? []
  for (const [index, argument] of args.entries()) {
    if (argument.startsWith('"')) {
      args[index] = argument.slice(1, -1).trim()
    }
  }
  return [command.toLowerCase(), ...args]
}

export class CommandHandler {
  private readonly commands = new Map<string, CommandDefinition>()
  private readonly admins: Set<string>
  readonly cooldowns = new Map<string, number>()
  private readonly noticeCooldowns = new Map<string, number>()

  constructor(catalog: readonly CommandDefinition[], admins: readonly string[]) {
    this.admins = new Set(admins.map((name) => name.toLowerCase()))
    for (const definition of catalog) {
      for (const name of [definition.name, ...(definition.aliases ?? [])]) {
        if (this.commands.has(name)) {
          throw new Error(`Command name "${name}" is already registered.`)
        }
        this.commands.set(name, definition)
      }
    }

    setInterval(() => {
      const now = Date.now()
      for (const ledger of [this.cooldowns, this.noticeCooldowns]) {
        for (const [key, expiresAt] of ledger) {
          if (expiresAt <= now) {
            ledger.delete(key)
          }
        }
      }
    }, COOLDOWN_CLEANUP_MS).unref()
  }

  lookup = (name: string | undefined): CommandDefinition | undefined =>
    name === undefined ? undefined : this.commands.get(name)

  async handleMessage(message: MessageType): Promise<void> {
    const [command, ...args] = parseMessage(message.content)
    const definition = this.lookup(command)
    if (command === undefined || definition === undefined) {
      return
    }

    const context = {
      channelName: message.channel.name.toLowerCase().replace('#', ''),
      client: message.channel.client,
      suffix: null,
    }
    // A rejected command would otherwise reach the service's fatal unhandledRejection handler.
    try {
      await commandContext.run(context, async () => {
        await this.dispatch(definition, message, args, command)
      })
    } catch (error) {
      logger.error('[COMMAND] Handler threw', {
        channel: message.channel.name,
        command: definition.name,
        error,
      })
    }
  }

  private async dispatch(
    definition: CommandDefinition,
    message: MessageType,
    args: string[],
    command: string
  ): Promise<void> {
    const { channel, user } = message
    const { client, settings } = channel
    const { name, dbkey, cooldown = DEFAULT_COOLDOWN_MS, permission = 0 } = definition
    const admin = this.admins.has(user.name.toLowerCase())
    if (!admin && user.permission < permission) {
      return
    }

    if (
      definition.allowWhenDisabled !== true &&
      getValueOrDefault(DBSettings.commandDisable, settings, client.subscription)
    ) {
      return
    }

    const now = Date.now()
    const cooldownKey = `${channel.id}.${name}`
    const onCooldown = !admin && (this.cooldowns.get(cooldownKey) ?? 0) > now

    if (!admin && dbkey !== undefined) {
      const enabled = Boolean(getValueOrDefault(dbkey, settings, client.subscription))
      if (!enabled) {
        if (!onCooldown) {
          this.notifySubscriptionRequired(definition, message, dbkey, cooldownKey, now)
        }
        return
      }
    }

    if (definition.onlyOnline === true && !client.stream_online) {
      chatClient.say(
        channel.name,
        t('notLive', { emote: 'PauseChamp', lng: client.locale }),
        user.messageId
      )
      return
    }

    if (onCooldown) {
      return
    }
    if (cooldown > 0) {
      this.cooldowns.set(cooldownKey, now + cooldown)
    }

    const invocation = admin
      ? { ...message, user: { ...user, permission: Math.max(4, user.permission) } }
      : message
    const context = commandContext.getStore()
    if (context) {
      context.suffix = prepareSuggestionSuffix(name, invocation, this.lookup)
    }
    await definition.handler(invocation, args, command)
  }

  private notifySubscriptionRequired(
    definition: CommandDefinition,
    { channel, user }: MessageType,
    dbkey: SettingKeys,
    cooldownKey: string,
    now: number
  ): void {
    const { client, settings } = channel
    const configured = Boolean(getRawSettingValue(dbkey, settings))
    if (
      (this.noticeCooldowns.get(cooldownKey) ?? 0) > now ||
      !configured ||
      canAccessFeature(dbkey, client.subscription).hasAccess
    ) {
      return
    }

    const cooldown = definition.cooldown ?? DEFAULT_COOLDOWN_MS
    if (cooldown > 0) {
      this.noticeCooldowns.set(cooldownKey, now + cooldown)
    }
    chatClient.say(
      channel.name,
      t('subscriptionRequired', {
        channel: client.name,
        command: `!${definition.name}`,
        lng: client.locale,
      }),
      user.messageId
    )
  }
}
