import { t } from 'i18next'

import { logger } from '../utils/logger.js'
import { prisma } from './prisma.js'

interface WL {
  lng: string
  channelId: string
  mmrEnabled: false
  startDate?: Date | null
}

export async function getWL({ lng, channelId, mmrEnabled, startDate }: WL) {
  if (!channelId) {
    return Promise.resolve({ record: [{ win: 0, lose: 0, type: 'U' }], msg: null })
  }

  return prisma.bet
    .groupBy({
      by: ['won', 'lobby_type', 'is_party', 'is_doubledown'],
      _count: {
        won: true,
        is_party: true,
        is_doubledown: true,
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
    .then((matches) => {
      const ranked: { win: number; lose: number; mmr: number } = { win: 0, lose: 0, mmr: 0 }
      const unranked: { win: number; lose: number } = { win: 0, lose: 0 }

      matches.forEach((match) => {
        if (match.lobby_type === 7) {
          if (match.won) {
            ranked.win += match._count.won
          } else {
            ranked.lose += match._count.won
          }

          const wonMulti = match._count.won * (match.won ? 1 : -1)
          const multiplier = match.is_party ? 20 : 25
          ranked.mmr += wonMulti * (match.is_doubledown ? multiplier * 2 : multiplier)
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
      const mmrMsg = mmrEnabled ? ` | ${ranked.mmr >= 0 ? '+' : ''}${ranked.mmr} MMR` : ''
      const rankedMsg = `${t('ranked', { lng })} ${ranked.win} W - ${ranked.lose} L${mmrMsg}`
      const unrankedMsg = `${t('unranked', { lng })} ${unranked.win} W - ${unranked.lose} L`

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
