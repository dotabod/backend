import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import { notablePlayers } from '../../steam/notableplayers.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('np', {
  aliases: ['players', 'who'],
  onlyOnline: true,
  dbkey: DBSettings.commandNP,
  handler: async (message, args) => {
    const [addOrRemove, forSteam32Id, ...name] = args
    const {
      user: { name: chatterName },
      channel: { client, name: channel, id: twitchChannelId },
    } = message

    if (!client.steam32Id) {
      chatClient.say(
        message.channel.name,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    async function addRemoveHandler() {
      if (addOrRemove === 'add') {
        const forName = name.join(' ')
        if (!Number(forSteam32Id) || !forName) {
          chatClient.say(message.channel.name, t('npAdd', { lng: message.channel.client.locale }))
          return
        }

        const mongo = MongoDBSingleton
        const db = await mongo.connect()

        try {
          await db.collection('notablePlayers').updateOne(
            { account_id: Number(forSteam32Id), channel: twitchChannelId },
            {
              $set: {
                account_id: Number(forSteam32Id),
                name: forName,
                channel: twitchChannelId,
                addedBy: chatterName,
                createdAt: new Date(),
              },
            },
            { upsert: true },
          )
          chatClient.say(
            message.channel.name,
            t('npAdded', { name: forName, lng: message.channel.client.locale }),
          )
          return
        } finally {
          await mongo.close()
        }
      }

      if (addOrRemove === 'remove') {
        if (!Number(forSteam32Id)) {
          chatClient.say(
            message.channel.name,
            t('npRemove', { lng: message.channel.client.locale }),
          )
          return
        }

        const mongo = MongoDBSingleton
        const db = await mongo.connect()

        try {
          const removed = await db
            .collection('notablePlayers')
            .deleteOne({ channel: twitchChannelId, account_id: Number(forSteam32Id) })
          if (removed.deletedCount) {
            chatClient.say(
              message.channel.name,
              t('npRemoved', { steamid: forSteam32Id, lng: message.channel.client.locale }),
            )
          } else {
            chatClient.say(
              message.channel.name,
              t('npUnknown', { steamid: forSteam32Id, lng: message.channel.client.locale }),
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

    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })
    const enableCountries = getValueOrDefault(
      DBSettings.notablePlayersOverlayFlagsCmd,
      client.settings,
    )
    notablePlayers({
      locale: client.locale,
      twitchChannelId,
      currentMatchId: client.gsi?.map?.matchid,
      players: matchPlayers,
      enableFlags: enableCountries,
      steam32Id: client.steam32Id,
      token: client.token,
    })
      .then((desc) => {
        chatClient.say(message.channel.name, desc.description)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        )
      })
  },
})
