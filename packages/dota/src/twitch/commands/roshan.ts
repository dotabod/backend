import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import RedisClient from '../../db/redis.js'
import {
  AegisRes,
  generateAegisMessage,
} from '../../dota/events/gsi-events/event.aegis_picked_up.js'
import { generateRoshanMessage, RoshRes } from '../../dota/events/gsi-events/event.roshan_killed.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const redisClient = RedisClient.getInstance()

commandHandler.registerCommand('roshan', {
  onlyOnline: true,
  aliases: ['rosh', 'aegis'],
  dbkey: DBSettings.commandRosh,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(channel, t('notPlaying', { emote: 'PauseChamp', lng: client.locale }))
      return
    }

    if (!client.gsi?.hero?.name) {
      chatClient.say(channel, t('noHero', { lng: client.locale }))
      return
    }

    async function handler() {
      const roshJson = (await redisClient.client.json.get(
        `${client.token}:roshan`,
      )) as RoshRes | null
      const aegisRes = (await redisClient.client.json.get(
        `${client.token}:aegis`,
      )) as unknown as AegisRes | null

      if (!roshJson?.minS && !roshJson?.maxS) {
        chatClient.say(channel, t('roshanAlive', { emote: 'Happi', lng: client.locale }))
        return
      }

      const msgs = [generateRoshanMessage(roshJson, client.locale)]

      if (aegisRes) {
        msgs.push(generateAegisMessage(aegisRes, client.locale))
      }

      chatClient.say(channel, msgs.join(' · '))
    }

    void handler()
  },
})
