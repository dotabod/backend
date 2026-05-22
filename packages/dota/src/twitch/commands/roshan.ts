import { t } from 'i18next'

import RedisClient from '../../db/RedisClient'
import type { AegisRes } from '../../dota/events/gsi-events/AegisRes'
import { generateAegisMessage } from '../../dota/events/gsi-events/generateAegisMessage'
import type { RoshRes } from '../../dota/events/gsi-events/RoshRes'
import { generateRoshanMessage } from '../../dota/events/gsi-events/RoshRes'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('roshan', {
  onlyOnline: true,
  aliases: ['rosh', 'aegis'],
  dbkey: DBSettings.commandRosh,
  handler: async (message, args) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: client.locale }),
        message.user.messageId,
      )
      return
    }

    if (!client.gsi?.hero?.name) {
      chatClient.say(channel, t('noHero', { lng: client.locale }), message.user.messageId)
      return
    }

    const redisClient = RedisClient.getInstance()
    const [roshJson, aegisRes] = await Promise.all([
      redisClient.getJson<RoshRes>(`${client.token}:roshan`),
      redisClient.getJson<AegisRes>(`${client.token}:aegis`),
    ])

    if (!roshJson?.minS && !roshJson?.maxS) {
      chatClient.say(
        channel,
        t('roshanAlive', { emote: 'Happi', lng: client.locale }),
        message.user.messageId,
      )
      return
    }

    const msgs = [generateRoshanMessage(roshJson, client.locale)]

    if (aegisRes) {
      msgs.push(generateAegisMessage(aegisRes, client.locale))
    }

    chatClient.say(channel, msgs.join(' · '), message.user.messageId)
  },
})
