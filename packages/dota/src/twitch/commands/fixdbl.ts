import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { MULTIPLIER_PARTY, MULTIPLIER_SOLO } from '../../db/get-wl'
import { updateMmr } from '../../dota/lib/update-mmr'
import { dotabodMatchHistoryUrl } from '../../utils/index'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

interface DoubledownMmr {
  currentMmr: number
  isParty: boolean
  didWin: boolean
  wasDoubledown: boolean
}

export const toggleDoubledownMmr = function toggleDoubledownMmr({
  currentMmr,
  isParty,
  didWin,
  wasDoubledown,
}: DoubledownMmr) {
  const change = isParty ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
  return currentMmr + change * (didWin === wasDoubledown ? -1 : 1)
}

commandHandler.registerCommand('fixdbl', {
  aliases: ['fixdd'],
  cooldown: 0,
  handler: async (message, _args) => {
    const { data } = await supabase
      .from('matches')
      .select('won, is_party, id, is_doubledown')
      .eq('userId', message.channel.client.token)
      .not('won', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const bet = data ? data[0] : null

    if (!bet) {
      chatClient.say(
        message.channel.name,
        t('noLastMatch', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

    chatClient.say(
      message.channel.name,
      t('toggleMatch', {
        context: bet.is_doubledown ? 'single' : 'double',
        lng: message.channel.client.locale,
        url: dotabodMatchHistoryUrl(message.channel.client),
      }),
      message.user.messageId
    )

    await updateMmr({
      channel: message.channel.name,
      currentMmr: message.channel.client.mmr,
      newMmr: toggleDoubledownMmr({
        currentMmr: message.channel.client.mmr,
        didWin: !!bet.won,
        isParty: bet.is_party,
        wasDoubledown: bet.is_doubledown,
      }),
      steam32Id: message.channel.client.steam32Id,
      tellChat: !message.channel.client.stream_online,
    })

    await supabase
      .from('matches')
      .update({
        is_doubledown: !bet.is_doubledown,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bet.id)
  },
  permission: 2,
})
