import { DBSettings } from '../../db/settings.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import Mongo from '../../steam/mongo.js'
import { notablePlayers } from '../../steam/notableplayers.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const mongo = Mongo.getInstance()

commandHandler.registerCommand('np', {
  aliases: ['players', 'who'],
  permission: 0,
  cooldown: 15000,
  dbkey: DBSettings.commandNP,
  handler: (message: MessageType, args: string[]) => {
    const [addOrRemove, forSteam32Id, forName] = args
    const {
      user: { name: chatterName, permission: chatterPermission },
      channel: { client, name: channel, id: twitchChannelId },
    } = message

    if (!client.steam32Id) {
      void chatClient.say(channel, 'Unknown steam ID. Play a match first!')
      return
    }

    async function addRemoveHandler() {
      if (!forSteam32Id || !forName) {
        void chatClient.say(channel, 'Try !np <add | remove> <steam32id> <playername>')
        return
      }

      const db = await mongo.db
      if (addOrRemove === 'add') {
        await db.collection('notablePlayers').updateOne(
          { account_id: forSteam32Id },
          {
            $set: {
              account_id: forSteam32Id,
              name: forName,
              channel: twitchChannelId,
              addedBy: chatterName,
              createdAt: new Date(),
            },
          },
          { upsert: true },
        )
        void chatClient.say(channel, `Added ${forName} to !np for this channel`)
        return
      }

      if (addOrRemove === 'remove') {
        await db.collection('notablePlayers').deleteOne({ account_id: forSteam32Id })
        void chatClient.say(channel, `Removed ${forName} from !np for this channel`)
        return
      }
    }

    if (chatterPermission >= 2 && (addOrRemove === 'add' || addOrRemove === 'remove')) {
      void addRemoveHandler()
      return
    }

    const matchPlayers = getCurrentMatchPlayers(client.gsi)
    notablePlayers(twitchChannelId, client.gsi?.map?.matchid, matchPlayers)
      .then((desc) => {
        void chatClient.say(channel, desc)
      })
      .catch((e) => {
        void chatClient.say(channel, e?.message ?? 'Game was not found.')
      })
  },
})
