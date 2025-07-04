import { moderateText } from '@dotabod/profanity-filter'
import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import type { NotablePlayers } from '../../steam/notableplayers.js'
import { notablePlayers } from '../../steam/notableplayers.js'
import { is8500Plus } from '../../utils/index.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('np', {
  dbkey: DBSettings.commandNP,
  handler: async (message, args) => {
    const [addOrRemove, forSteam32Id, ...name] = args
    const {
      user: { name: chatterName },
      channel: { client, name: channel, id: twitchChannelId },
    } = message

    if (!client.steam32Id) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    async function addRemoveHandler() {
      if (addOrRemove === 'add') {
        const forName = name.join(' ')
        if (!Number(forSteam32Id) || !forName) {
          chatClient.say(
            channel,
            t('npAdd', { lng: message.channel.client.locale }),
            message.user.messageId,
          )
          return
        }

        const mongo = MongoDBSingleton
        const db = await mongo.connect()

        try {
          await db.collection<NotablePlayers>('notablePlayers').updateOne(
            { account_id: Number(forSteam32Id), channel: twitchChannelId },
            {
              $set: {
                account_id: Number(forSteam32Id),
                name: (await moderateText(forName)) ?? 'Player',
                channel: twitchChannelId,
                addedBy: chatterName,
                createdAt: new Date(),
              },
            },
            { upsert: true },
          )
          chatClient.say(
            channel,
            t('npAdded', {
              name: (await moderateText(forName)) ?? 'Player',
              lng: message.channel.client.locale,
            }),
            message.user.messageId,
          )
          return
        } finally {
          await mongo.close()
        }
      }

      if (addOrRemove === 'remove') {
        if (!Number(forSteam32Id)) {
          chatClient.say(
            channel,
            t('npRemove', { lng: message.channel.client.locale }),
            message.user.messageId,
          )
          return
        }

        const mongo = MongoDBSingleton
        const db = await mongo.connect()

        try {
          const removed = await db
            .collection<NotablePlayers>('notablePlayers')
            .deleteOne({ channel: twitchChannelId, account_id: Number(forSteam32Id) })
          if (removed.deletedCount) {
            chatClient.say(
              channel,
              t('npRemoved', { steamid: forSteam32Id, lng: message.channel.client.locale }),
              message.user.messageId,
            )
          } else {
            chatClient.say(
              channel,
              t('npUnknown', { steamid: forSteam32Id, lng: message.channel.client.locale }),
              message.user.messageId,
            )
          }
          return
        } finally {
          await mongo.close()
        }
      }
    }

    if (
      commandHandler.hasPermission(message.user, 2) &&
      (addOrRemove === 'add' || addOrRemove === 'remove')
    ) {
      try {
        await addRemoveHandler()
      } catch (e) {
        logger.error('Error in addremovehandler command', { e })
      }
      return
    }

    if (!message.channel.client.stream_online) {
      chatClient.say(
        message.channel.name,
        t('notLive', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })
    const enableCountries = getValueOrDefault(
      DBSettings.notablePlayersOverlayFlagsCmd,
      client.settings,
      client.subscription,
    )
    notablePlayers({
      client: client,
      locale: client.locale,
      twitchChannelId,
      currentMatchId: client.gsi?.map?.matchid,
      players: matchPlayers,
      enableFlags: enableCountries,
      steam32Id: client.steam32Id,
    })
      .then((desc) => {
        let append = ''
        if (
          matchPlayers.length === 1 &&
          matchPlayers[0].accountid === client.steam32Id &&
          is8500Plus(client)
        ) {
          append = ` · ${t('matchData8500', { emote: 'PoroSad', lng: message.channel.client.locale })}`
        }
        chatClient.say(channel, desc.description + append, message.user.messageId)
      })
      .catch((e) => {
        chatClient.say(
          channel,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
          message.user.messageId,
        )
      })
  },
})
