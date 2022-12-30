import { DBSettings } from '../../db/settings.js'
import getHero from '../../dota/lib/getHero.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('hero', {



  onlyOnline: true,
  dbkey: DBSettings.commandHero,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.steam32Id) {
      void chatClient.say(channel, 'No steam32Id found')
      return
    }
    if (!client.gsi?.hero?.name) {
      void chatClient.say(channel, 'No hero found')
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, 'Not playing PauseChamp')
      return
    }

    const hero = getHero(client.gsi.hero.name)

    if (!hero) {
      void chatClient.say(channel, "Couldn't find hero Sadge")
      return
    }

    void chatClient.say(
      channel,
      `!hero command disabled because opendota blocked us for having too many users Sadge`,
    )
  },
})
