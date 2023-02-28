import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import Mongo from '../../steam/mongo.js'
import { notablePlayers } from '../../steam/notableplayers.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const mongo = await Mongo.connect()

commandHandler.registerCommand('np', {
  aliases: ['players', 'who'],
  onlyOnline: true,
  dbkey: DBSettings.commandNP,
  handler: (message: MessageType, args: string[]) => {
    const [addOrRemove, forSteam32Id, ...name] = args
    const {
      user: { name: chatterName },
      channel: { client, name: channel, id: twitchChannelId },
    } = message

    if (!client.steam32Id) {
      chatClient.say(channel, message.channel.client.multiAccount ? t('multiAccount', { lng: message.channel.client.locale, url: 'dotabod.com/dashboard/features' }) : t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }

    async function addRemoveHandler() {
      if (addOrRemove === 'add') {
        const forName = name.join(' ')
        if (!Number(forSteam32Id) || !forName) {
          chatClient.say(channel, t('npAdd', { lng: message.channel.client.locale }))
          return
        }

        await mongo.collection('notablePlayers').updateOne(
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
        chatClient.say(channel, t('npAdded', { name: forName, lng: message.channel.client.locale }))
        return
      }

      if (addOrRemove === 'remove') {
        if (!Number(forSteam32Id)) {
          chatClient.say(channel, t('npRemove', { lng: message.channel.client.locale }))
          return
        }

        const removed = await mongo
          .collection('notablePlayers')
          .deleteOne({ channel: twitchChannelId, account_id: Number(forSteam32Id) })
        if (removed.deletedCount) {
          chatClient.say(
            channel,
            t('npRemoved', { steamid: forSteam32Id, lng: message.channel.client.locale }),
          )
        } else {
          chatClient.say(
            channel,
            t('npUnknown', { steamid: forSteam32Id, lng: message.channel.client.locale }),
          )
        }
        return
      }
    }

    if (
      commandHandler.hasPermission(message.user, 2) &&
      (addOrRemove === 'add' || addOrRemove === 'remove')
    ) {
      void addRemoveHandler()
      return
    }

    const dotaClient = gsiHandlers.get(client.token)
    const matchPlayers = dotaClient?.players?.matchPlayers || getCurrentMatchPlayers(client.gsi)
    notablePlayers(client.locale, twitchChannelId, client.gsi?.map?.matchid, matchPlayers)
      .then((desc) => {
        chatClient.say(channel, desc.description)
      })
      .catch((e) => {
        chatClient.say(
          channel,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        )
      })
  },
})
