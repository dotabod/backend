import { t } from 'i18next'
import type { Socket as ClientSocket } from 'socket.io-client'

import { steamSocket, twitchChat, twitchEvents } from '../../steam/ws'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

const VERSION_ACK_TIMEOUT_MS = 2000

function fetchVersion(socket: ClientSocket): Promise<string | null> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve(null)
      return
    }
    const timer = setTimeout(() => resolve(null), VERSION_ACK_TIMEOUT_MS)
    socket.emit('getVersion', (commitHash: string | null) => {
      clearTimeout(timer)
      resolve(commitHash ?? null)
    })
  })
}

commandHandler.registerCommand('version', {
  handler: async (message: MessageType, _args: string[]) => {
    const dotaHash = process.env.COMMIT_HASH ?? null
    const [steamHash, chatHash, eventsHash] = await Promise.all([
      fetchVersion(steamSocket),
      fetchVersion(twitchChat),
      fetchVersion(twitchEvents),
    ])

    const versions: Record<string, string | null> = {
      dota: dotaHash,
      steam: steamHash,
      'twitch-chat': chatHash,
      'twitch-events': eventsHash,
    }
    const known = Object.values(versions).filter((v): v is string => Boolean(v))
    const uniqueHashes = new Set(known)

    if (known.length === 0) {
      chatClient.say(
        message.channel.name,
        t('version.unknown', {
          url: 'github.com/dotabod/backend',
          lng: message.channel.client.locale,
        }),
        message.user.messageId,
      )
      return
    }

    const allKnownAndSame = uniqueHashes.size === 1 && known.length === Object.keys(versions).length
    const versionStr = allKnownAndSame
      ? (known[0] as string)
      : Object.entries(versions)
          .map(([name, hash]) => `${name}:${hash ?? '?'}`)
          .join(', ')
    const url = allKnownAndSame
      ? `github.com/dotabod/backend/compare/${known[0]}...master`
      : 'github.com/dotabod/backend/commits/master'

    chatClient.say(
      message.channel.name,
      t('version.commit', {
        lng: message.channel.client.locale,
        version: versionStr,
        url,
      }),
      message.user.messageId,
    )
  },
})
