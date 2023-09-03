import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import RedisClient from '../../db/RedisClient.js'
import {
  AegisRes,
  generateAegisMessage,
} from '../../dota/events/gsi-events/event.aegis_picked_up.js'
import { generateRoshanMessage, RoshRes } from '../../dota/events/gsi-events/event.roshan_killed.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('roshan', {
  onlyOnline: true,
  aliases: ['rosh', 'aegis'],
  dbkey: DBSettings.commandRosh,
  handler: async (message: MessageType, args: string[]) => {
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

    const redisClient = RedisClient.getInstance()
    const roshJson = (await redisClient.client.json.get(`${client.token}:roshan`)) as RoshRes | null
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
  },
})
