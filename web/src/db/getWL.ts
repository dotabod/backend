import { logger } from '../utils/logger.js'
import { prisma } from './prisma.js'

export async function getWL(channelId: string, startDate: Date | null) {
  if (!channelId) {
    return Promise.resolve({ record: [{ win: 0, lose: 0, type: 'U' }], msg: null })
  }

  if (!startDate) {
    logger.info('[WL] Stream not live??', { channelId, startDate })
  }

  return prisma.bet
    .groupBy({
      by: ['won', 'lobby_type'],
      _count: {
        won: true,
      },
      where: {
        won: {
          not: null,
        },
        lobby_type: {
          not: null,
          in: [0, 7],
        },
        user: {
          Account: {
            provider: 'twitch',
            providerAccountId: channelId,
          },
        },
        createdAt: {
          // if its null then only the last 12 hours from now
          // should never be null but just in case
          gte: startDate ?? new Date(new Date().getTime() - 12 * 60 * 60 * 1000),
        },
      },
    })
    .then((r) => {
      const ranked: { win: number; lose: number } = { win: 0, lose: 0 }
      const unranked: { win: number; lose: number } = { win: 0, lose: 0 }

      r.forEach((match) => {
        if (match.lobby_type === 7) {
          if (match.won) {
            ranked.win += match._count.won
          } else {
            ranked.lose += match._count.won
          }
        } else {
          if (match.won) {
            unranked.win += match._count.won
          } else {
            unranked.lose += match._count.won
          }
        }
      })

      const hasUnranked = unranked.win + unranked.lose !== 0
      const hasRanked = ranked.win + ranked.lose !== 0

      const record = []
      if (hasRanked) record.push({ win: ranked.win, lose: ranked.lose, type: 'R' })
      if (hasUnranked) record.push({ win: unranked.win, lose: unranked.lose, type: 'U' })
      if (!hasRanked && !hasUnranked) record.push({ win: 0, lose: 0, type: 'U' })

      const msg = []
      const mmrGainOrLoss = (ranked.win - ranked.lose) * 30
      const mmrMsg = ` | ${mmrGainOrLoss >= 0 ? '+' : ''}${mmrGainOrLoss} MMR`
      const rankedMsg = `Ranked ${ranked.win} W - ${ranked.lose} L${mmrMsg}`
      const unrankedMsg = `Unranked ${unranked.win} W - ${unranked.lose} L`

      if (hasRanked) msg.push(rankedMsg)
      if (hasUnranked) msg.push(unrankedMsg)
      if (!hasRanked && !hasUnranked) msg.push('0 W - 0 L')
      return { record, msg: msg.join(' · ') }
    })
    .catch((e) => {
      logger.error('[WL] Prisma Error getting WL', { error: e.message, channelId })
      return { record: [{ win: 0, lose: 0, type: 'U' }], msg: null }
    })
}
