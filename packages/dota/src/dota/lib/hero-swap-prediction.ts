import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import RedisClient from '../../db/redis-client'
import { DBSettings, getValueOrDefault } from '../../settings'
import { openTwitchBet } from '../../twitch/lib/open-twitch-bet'
import { refundTwitchBet } from '../../twitch/lib/refund-twitch-bets'
import { getStreamDelay } from '../get-stream-delay'
import type { GSIHandlerType } from '../gsi-handler-types'
import { say } from '../say'
import { delayedQueue } from './delayed-queue'
import getHero from './get-hero'
import type { HeroNames } from './get-hero'
import { isPlayingMatch } from './is-playing-match'

interface HeroSwap {
  matchId: string
  hero: HeroNames
  taskId?: string
}

const swaps = new WeakMap<GSIHandlerType, HeroSwap>()
const redis = RedisClient.getInstance()

export const cancelHeroSwap = function cancelHeroSwap(handler: GSIHandlerType): void {
  const taskId = swaps.get(handler)?.taskId
  swaps.delete(handler)
  if (taskId !== undefined) {
    delayedQueue.removeTask(taskId)
  }
}

const isSwapCurrent = function isSwapCurrent(handler: GSIHandlerType, swap: HeroSwap): boolean {
  const { client } = handler
  const map = client.gsi?.map
  if (map?.matchid !== swap.matchId || swaps.get(handler) !== swap || handler.endingBets) {
    return false
  }

  const winner = map.win_team
  const unfinished = winner === undefined || winner.length === 0 || winner === 'none'
  return (
    unfinished &&
    !handler.disabled &&
    client.stream_online &&
    isPlayingMatch(client.gsi) &&
    getValueOrDefault(DBSettings.bets, client.settings, client.subscription)
  )
}

const reopenPrediction = async function reopenPrediction(
  handler: GSIHandlerType,
  swap: HeroSwap,
  matchRowId: string,
  previousHero: string
): Promise<void> {
  if (!isSwapCurrent(handler, swap)) {
    return
  }

  const { client } = handler
  const channelId = handler.getChannelId()
  const heroName = getHero(swap.hero)?.localized_name
  let predictionId: string | null = null
  try {
    const bet = await openTwitchBet({ client, heroName })
    predictionId = bet?.id ?? null
  } catch (error) {
    logger.error('[BETS] Could not reopen prediction after hero swap', {
      error,
      matchId: swap.matchId,
    })
  }
  if (!isSwapCurrent(handler, swap)) {
    if (predictionId !== null) {
      await refundTwitchBet(channelId, predictionId)
    }
    return
  }

  const { data: updated, error } = await supabase
    .from('matches')
    .update({
      hero_name: swap.hero,
      predictionId,
      updated_at: new Date().toISOString(),
    })
    .is('won', null)
    .eq('id', matchRowId)
    .select('id')
    .maybeSingle()

  if (updated === null || error !== null) {
    if (error !== null) {
      logger.error('[BETS] Could not save the new hero and prediction', { error, matchRowId })
    }
    if (predictionId !== null) {
      await refundTwitchBet(channelId, predictionId)
    }
    return
  }

  if (predictionId === null || !isSwapCurrent(handler, swap)) {
    return
  }

  const oldHeroName = getHero(previousHero)?.localized_name ?? previousHero
  const newHeroName = heroName ?? swap.hero
  if (getValueOrDefault(DBSettings.tellChatBets, client.settings, client.subscription)) {
    say(
      client,
      t('bets.remade', {
        emote: 'Okayeg 👍',
        emote2: 'peepoGamble',
        lng: client.locale,
        newHeroName,
        oldHeroName,
      })
    )
  }
  logger.info('[BETS] remade bets', {
    event: 'open_bets',
    newHeroName,
    oldHeroName,
    player_team: client.gsi?.player?.team_name,
    user: client.token,
  })
}

export const handleHeroSwap = async function handleHeroSwap(
  handler: GSIHandlerType,
  name: HeroNames
): Promise<void> {
  const { client } = handler
  const matchId = client.gsi?.map?.matchid
  if (matchId === undefined || matchId.length === 0) {
    return
  }

  const previous = swaps.get(handler)
  if (previous?.matchId === matchId && previous.hero === name) {
    return
  }

  cancelHeroSwap(handler)
  const swap: HeroSwap = { hero: name, matchId }
  swaps.set(handler, swap)

  try {
    if (!isSwapCurrent(handler, swap)) {
      return
    }

    const heroKey = `${client.token}:playingHero`
    const [previousHero, storedMatchId] = await Promise.all([
      redis.client.get(heroKey),
      redis.client.get(`${client.token}:matchId`),
    ])
    if (!isSwapCurrent(handler, swap) || storedMatchId !== matchId) {
      return
    }

    if (previousHero === null || previousHero.length === 0 || previousHero === name) {
      await redis.client.set(heroKey, name)
      return
    }

    const { data: match } = await supabase
      .from('matches')
      .select('id,predictionId')
      .eq('matchId', matchId)
      .eq('userId', client.token)
      .is('won', null)
      .single()
    if (!match || !isSwapCurrent(handler, swap)) {
      return
    }

    if (match.predictionId !== null && match.predictionId.length > 0) {
      await refundTwitchBet(handler.getChannelId(), match.predictionId)
    }
    if (!isSwapCurrent(handler, swap)) {
      return
    }

    swap.taskId = delayedQueue.addTask(
      getStreamDelay(client.settings, client.subscription),
      async () => {
        try {
          await reopenPrediction(handler, swap, match.id, previousHero)
        } finally {
          if (swaps.get(handler) === swap) {
            swaps.delete(handler)
          }
        }
      }
    )
    await redis.client.set(heroKey, name)
  } finally {
    if (swap.taskId === undefined && swaps.get(handler) === swap) {
      swaps.delete(handler)
    }
  }
}
