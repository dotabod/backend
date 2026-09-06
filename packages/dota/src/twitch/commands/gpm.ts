import { t } from 'i18next'

import { getHeroNameOrColor } from '../../dota/lib/heroes'
import { DBSettings } from '../../settings'
import type { Player, SocketClient } from '../../types'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'
import { findAccountFromCmd } from '../lib/find-gsi-by-account-id'

type LookupPlayer = Awaited<ReturnType<typeof findAccountFromCmd>>['player']

interface GpmPlayerData {
  gold_from_creep_kills: number
  gold_from_hero_kills: number
  gpm: number
}

const hasPlayerMetric = function hasPlayerMetric<Metric extends keyof GpmPlayerData>(
  player: LookupPlayer,
  metric: Metric
): player is LookupPlayer & Pick<GpmPlayerData, Metric> {
  return player !== undefined && metric in player
}

const getPlayerMetric = function getPlayerMetric(
  player: LookupPlayer,
  fallbackPlayer: Player | undefined,
  metric: keyof GpmPlayerData
): number | undefined {
  return hasPlayerMetric(player, metric) ? player[metric] : fallbackPlayer?.[metric]
}

const getGpmHeroName = function getGpmHeroName(
  lookup: Awaited<ReturnType<typeof findAccountFromCmd>>,
  client: SocketClient
): string | undefined {
  if (hasPlayerMetric(lookup.player, 'gpm')) {
    return getHeroNameOrColor(lookup.hero?.id ?? 0, lookup.playerIdx)
  }

  return getHeroNameOrColor(client.gsi?.hero?.id ?? 0)
}

const handleGpm = async function handleGpm(
  message: MessageType,
  args: string[],
  command: string
): Promise<void> {
  const {
    channel: { name: channel, client },
  } = message

  try {
    const lookup = await findAccountFromCmd(client, args, client.locale, command)
    const heroName = getGpmHeroName(lookup, client)
    const gpm = getPlayerMetric(lookup.player, client.gsi?.player, 'gpm')

    if (gpm === undefined || gpm === 0) {
      chatClient.say(
        channel,
        t('gpm_zero', { heroName, lng: client.locale, num: 0 }),
        message.user.messageId
      )
      return
    }

    const goldFromHeroKills = getPlayerMetric(
      lookup.player,
      client.gsi?.player,
      'gold_from_hero_kills'
    )
    const goldFromCreepKills = getPlayerMetric(
      lookup.player,
      client.gsi?.player,
      'gold_from_creep_kills'
    )

    chatClient.say(
      channel,
      t('gpm_other', {
        creepKills: goldFromCreepKills ?? 0,
        heroKills: goldFromHeroKills ?? 0,
        heroName,
        lng: client.locale,
        num: gpm,
      }),
      message.user.messageId
    )
  } catch (error) {
    chatClient.say(
      channel,
      error instanceof Error ? error.message : t('gameNotFound', { lng: client.locale }),
      message.user.messageId
    )
  }
}

commandHandler.registerCommand('gpm', {
  dbkey: DBSettings.commandGPM,
  handler: handleGpm,
  onlyOnline: true,
})
