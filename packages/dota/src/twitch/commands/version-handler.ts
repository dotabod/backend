import { t } from 'i18next'

import type { MessageType } from '../lib/command-handler'

const VERSION_ACK_TIMEOUT_MS = 2000

interface VersionAckEmitter {
  emitWithAck: (event: 'getVersion') => Promise<string | null>
}

export interface VersionSocket {
  connected: boolean
  timeout: (timeoutMs: number) => VersionAckEmitter
}

export interface VersionSnapshot {
  dota: string | null
  steam: string | null
  twitchChat: string | null
  twitchEvents: string | null
}

export interface VersionCommandDependencies {
  getVersions: () => Promise<VersionSnapshot>
  say: (channel: string, text: string, messageId?: string) => void
}

export const fetchSocketVersion = async function fetchSocketVersion(
  socket: VersionSocket
): Promise<string | null> {
  if (!socket.connected) {
    return null
  }

  try {
    return await socket.timeout(VERSION_ACK_TIMEOUT_MS).emitWithAck('getVersion')
  } catch {
    return null
  }
}

const toVersionEntries = function toVersionEntries(versions: VersionSnapshot) {
  return [
    ['dota', versions.dota],
    ['steam', versions.steam],
    ['twitch-chat', versions.twitchChat],
    ['twitch-events', versions.twitchEvents],
  ] as const
}

export const runVersionCommand = async function runVersionCommand(
  message: MessageType,
  dependencies: VersionCommandDependencies
): Promise<void> {
  const versions = await dependencies.getVersions()
  const versionEntries = toVersionEntries(versions)
  const knownVersions = versionEntries.flatMap(([, commitHash]) =>
    commitHash === null ? [] : [commitHash]
  )
  const [firstVersion] = knownVersions

  if (firstVersion === undefined) {
    dependencies.say(
      message.channel.name,
      t('version.unknown', {
        lng: message.channel.client.locale,
        url: 'github.com/dotabod/backend',
      }),
      message.user.messageId
    )
    return
  }

  const allKnownAndSame =
    knownVersions.length === versionEntries.length &&
    knownVersions.every((commitHash) => commitHash === firstVersion)
  const version = allKnownAndSame
    ? firstVersion
    : versionEntries.map(([service, commitHash]) => `${service}:${commitHash ?? '?'}`).join(', ')
  const url = allKnownAndSame
    ? `github.com/dotabod/backend/compare/${firstVersion}...master`
    : 'github.com/dotabod/backend/commits/master'

  dependencies.say(
    message.channel.name,
    t('version.commit', {
      lng: message.channel.client.locale,
      url,
      version,
    }),
    message.user.messageId
  )
}
