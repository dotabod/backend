import { moderateText } from '@dotabod/profanity-filter'
import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { getCurrentRosterMatchId, isCurrentCustomGame } from '../../dota/lib/get-current-match-id'
import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings, getValueOrDefault } from '../../settings'
import MongoDBSingleton from '../../steam/mongo-db-singleton'
import type { NotablePlayers } from '../../steam/notableplayers'
import { notablePlayers } from '../../steam/notableplayers'
import type { SocketClient } from '../../types'
import { chatClient } from '../chat-client'
import { clippingDisabledNote } from '../lib/clipping-note'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

type Roster = Awaited<ReturnType<MatchDataService['resolveRoster']>>

const sendNotablePlayers = async function sendNotablePlayers({
  client,
  enableCountries,
  matchDataService,
  message,
  roster,
  twitchChannelId,
}: {
  client: SocketClient
  enableCountries: boolean
  matchDataService: MatchDataService
  message: MessageType
  roster: Roster
  twitchChannelId: string
}): Promise<void> {
  const { name: channel } = message.channel
  try {
    const result = await notablePlayers({
      client,
      currentMatchId: client.gsi?.map?.matchid,
      enableFlags: enableCountries,
      heroesStatus: roster.heroesStatus,
      locale: client.locale,
      players: roster.players,
      rosterSource: roster.source,
      steam32Id: client.steam32Id,
      twitchChannelId,
    })
    let { description } = result
    const showStreamers = getValueOrDefault(
      DBSettings.streamersNpSuffix,
      client.settings,
      client.subscription
    )
    if (showStreamers) {
      const count = await matchDataService.getStreamersInMatchCount({
        excludeUserId: client.token,
      })
      if (count > 0) {
        description = `${description} · ${t('streamersSuffix', { count, lng: client.locale })}`
      }
    }
    chatClient.say(channel, description, message.user.messageId)
  } catch (error) {
    chatClient.say(
      channel,
      error instanceof Error ? error.message : t('gameNotFound', { lng: client.locale }),
      message.user.messageId
    )
  }
}

commandHandler.registerCommand('np', {
  dbkey: DBSettings.commandNP,
  handler: async (message, args) => {
    const [addOrRemove, forSteam32Id, ...name] = args
    const {
      user: { name: chatterName },
      channel: { client, name: channel, id: twitchChannelId },
    } = message

    if (client.steam32Id === null || client.steam32Id === 0) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount !== undefined &&
          message.channel.client.multiAccount !== 0
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

    const addRemoveHandler = async function addRemoveHandler() {
      if (addOrRemove === 'add') {
        const forName = name.join(' ')
        if (!Number(forSteam32Id) || !forName) {
          chatClient.say(
            channel,
            t('npAdd', { lng: message.channel.client.locale }),
            message.user.messageId
          )
          return
        }

        const mongo = MongoDBSingleton
        const db = await mongo.connect()

        try {
          const moderatedName = (await moderateText(forName)) ?? 'Player'
          await db.collection<NotablePlayers>('notablePlayers').updateOne(
            { account_id: Number(forSteam32Id), channel: twitchChannelId },
            {
              $set: {
                account_id: Number(forSteam32Id),
                addedBy: chatterName,
                channel: twitchChannelId,
                createdAt: new Date(),
                name: moderatedName,
              },
            },
            { upsert: true }
          )
          chatClient.say(
            channel,
            t('npAdded', {
              lng: message.channel.client.locale,
              name: moderatedName,
            }),
            message.user.messageId
          )
        } finally {
          mongo.close()
        }
      }

      if (addOrRemove === 'remove') {
        if (!Number(forSteam32Id)) {
          chatClient.say(
            channel,
            t('npRemove', { lng: message.channel.client.locale }),
            message.user.messageId
          )
          return
        }

        const mongo = MongoDBSingleton
        const db = await mongo.connect()

        try {
          const removed = await db
            .collection<NotablePlayers>('notablePlayers')
            .deleteOne({ account_id: Number(forSteam32Id), channel: twitchChannelId })
          if (removed.deletedCount) {
            chatClient.say(
              channel,
              t('npRemoved', { lng: message.channel.client.locale, steamid: forSteam32Id }),
              message.user.messageId
            )
          } else {
            chatClient.say(
              channel,
              t('npUnknown', { lng: message.channel.client.locale, steamid: forSteam32Id }),
              message.user.messageId
            )
          }
        } finally {
          mongo.close()
        }
      }
    }

    if (
      commandHandler.hasPermission(message.user, 2) &&
      (addOrRemove === 'add' || addOrRemove === 'remove')
    ) {
      try {
        await addRemoveHandler()
      } catch (error) {
        logger.error('Error in addremovehandler command', { error })
      }
      return
    }

    if (!message.channel.client.stream_online) {
      chatClient.say(
        message.channel.name,
        t('notLive', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

    if (client.gsi !== undefined && getCurrentRosterMatchId(client) === undefined) {
      chatClient.say(
        channel,
        t(isCurrentCustomGame(client) ? 'customGameNoRoster' : 'gameNotFound', {
          lng: client.locale,
        }),
        message.user.messageId
      )
      return
    }

    const mds = new MatchDataService(client)
    const roster = await mds.resolveRoster()
    const note = clippingDisabledNote(client, roster.players)
    // No clip/vision data to read at 8500+ with auto-clipping off — the note IS
    // the whole reply; don't prepend the empty "[heroes not found]: …" roster.
    if (note) {
      chatClient.sayWithoutSuggestion(channel, note, message.user.messageId)
      return
    }
    const enableCountries = getValueOrDefault(
      DBSettings.notablePlayersOverlayFlagsCmd,
      client.settings,
      client.subscription
    )
    await sendNotablePlayers({
      client,
      enableCountries,
      matchDataService: mds,
      message,
      roster,
      twitchChannelId,
    })
  },
})
