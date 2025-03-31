import { t } from 'i18next'

import { MULTIPLIER_PARTY } from '../../db/getWL.js'
import supabase from '../../db/supabase.js'
import { updateMmr } from '../../dota/lib/updateMmr.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

interface PartyMmr {
  currentMmr: number
  wasParty: boolean
  didWin: boolean
  isDoubledown: boolean
}

function togglePartyMmr({ currentMmr, wasParty, didWin, isDoubledown }: PartyMmr) {
  const newmmr = currentMmr
  const baseDelta = isDoubledown ? MULTIPLIER_PARTY : MULTIPLIER_PARTY / 2
  const delta = wasParty ? -baseDelta : baseDelta
  return didWin ? newmmr - delta : newmmr + delta
}

commandHandler.registerCommand('fixparty', {
  aliases: ['fixsolo'],
  permission: 2,
  cooldown: 0,
  handler: async (message, args) => {
    const { data } = await supabase
      .from('bets')
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
        context: bet.is_party ? 'solo' : 'party',
        url: `dotabuff.com/matches/${bet.matchId}`,
        lng: message.channel.client.locale,
      }),
      message.user.messageId,
    )

    await updateMmr({
      tellChat: !message.channel.client.stream_online,
      currentMmr: message.channel.client.mmr,
      newMmr: togglePartyMmr({
        currentMmr: message.channel.client.mmr,
        wasParty: bet.is_party,
        didWin: !!bet.won,
        isDoubledown: bet.is_doubledown,
      }),
      steam32Id: message.channel.client.steam32Id,
      channel: message.channel.name,
    })

    await supabase
      .from('bets')
      .update({
        is_party: !bet.is_party,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bet.id)
  },
})
