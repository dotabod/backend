import { t } from 'i18next'

import RedisClient from '../../db/redis-client'
import type { AegisRes } from '../../dota/events/gsi-events/aegis-res'
import { generateAegisMessage } from '../../dota/events/gsi-events/generate-aegis-message'
import type { RoshRes } from '../../dota/events/gsi-events/rosh-res'
import { generateRoshanMessage } from '../../dota/events/gsi-events/rosh-res'
import { isPlayingMatch } from '../../dota/lib/is-playing-match'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('roshan', {
  aliases: ['rosh', 'aegis'],
  dbkey: DBSettings.commandRosh,
  handler: async (message) => {
    const {
      channel: { name: channel, client },
    } = message

    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: client.locale }),
        message.user.messageId
      )
      return
    }

    if (client.gsi?.hero?.name === undefined || client.gsi.hero.name.length === 0) {
      chatClient.say(channel, t('noHero', { lng: client.locale }), message.user.messageId)
      return
    }

    const redisClient = RedisClient.getInstance()
    const [roshJson, aegisRes] = await Promise.all([
      redisClient.getJson<RoshRes>(`${client.token}:roshan`),
      redisClient.getJson<AegisRes>(`${client.token}:aegis`),
    ])

    if (
      (roshJson?.minS === undefined || roshJson.minS === 0) &&
      (roshJson?.maxS === undefined || roshJson.maxS === 0)
    ) {
      chatClient.say(
        channel,
        t('roshanAlive', { emote: 'Happi', lng: client.locale }),
        message.user.messageId
      )
      return
    }

    const msgs = [generateRoshanMessage(roshJson, client.locale)]

    if (aegisRes) {
      msgs.push(generateAegisMessage(aegisRes, client.locale))
    }

    chatClient.say(channel, msgs.join(' · '), message.user.messageId)
  },
  onlyOnline: true,
})
