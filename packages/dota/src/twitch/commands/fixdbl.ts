import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../../db/getWL'
import { updateMmr } from '../../dota/lib/updateMmr'
import { dotabuffMatchUrl } from '../../utils/index'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

interface DoubledownMmr {
  currentMmr: number
  isParty: boolean
  didWin: boolean
  wasDoubledown: boolean
}

export function toggleDoubledownMmr({ currentMmr, isParty, didWin, wasDoubledown }: DoubledownMmr) {
  const change = isParty ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
  return currentMmr + change * (didWin === wasDoubledown ? -1 : 1)
}

commandHandler.registerCommand('fixdbl', {
  aliases: ['fixdd'],
  permission: 2,
  cooldown: 0,
  handler: async (message, _args) => {
    const { data } = await supabase
      .from('matches')
      .select('matchId, won, is_party, id, is_doubledown')
      .eq('userId', message.channel.client.token)
      .not('won', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const bet = data ? data[0] : null

    if (!bet) {
      chatClient.say(
        message.channel.name,
        t('noLastMatch', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    chatClient.say(
      message.channel.name,
      t('toggleMatch', {
        context: bet.is_doubledown ? 'single' : 'double',
        url: dotabuffMatchUrl(message.channel.client, bet.matchId),
        lng: message.channel.client.locale,
      }),
      message.user.messageId,
    )

    await updateMmr({
      tellChat: !message.channel.client.stream_online,
      currentMmr: message.channel.client.mmr,
      newMmr: toggleDoubledownMmr({
        currentMmr: message.channel.client.mmr,
        isParty: bet.is_party,
        didWin: !!bet.won,
        wasDoubledown: bet.is_doubledown,
      }),
      steam32Id: message.channel.client.steam32Id,
      channel: message.channel.name,
    })

    await supabase
      .from('matches')
      .update({
        is_doubledown: !bet.is_doubledown,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bet.id)
  },
})
