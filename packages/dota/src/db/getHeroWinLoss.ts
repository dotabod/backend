import { logger, supabase } from '@dotabod/shared-utils'
import { getHeroById } from '../dota/lib/heroes'

const HERO_STATS_WINDOW_DAYS = 30

interface HeroWinLossParams {
  heroId: number
  isStreamer: boolean
  steam32Id: number
  token: string
}

export interface HeroWinLoss {
  lose: number
  win: number
}

export async function getHeroWinLoss({
  heroId,
  isStreamer,
  steam32Id,
  token,
}: HeroWinLossParams): Promise<HeroWinLoss | null> {
  const hero = getHeroById(heroId)
  if (!hero || !steam32Id || !token) return { lose: 0, win: 0 }

  try {
    const fromDate = new Date(
      Date.now() - HERO_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    let userId = token
    if (!isStreamer) {
      const { data: steamAccount, error: accountError } = await supabase
        .from('steam_accounts')
        .select('userId')
        .eq('steam32Id', steam32Id)
        .single()

      if (accountError || !steamAccount?.userId) return { lose: 0, win: 0 }
      userId = steamAccount.userId
    }

    const { data: matches, error } = await supabase
      .from('matches')
      .select('won')
      .eq('userId', userId)
      .eq('hero_name', hero.key)
      .not('won', 'is', null)
      .gte('created_at', fromDate)
    if (error) {
      logger.error('[HERO] Failed to read tracked hero stats', {
        error,
        heroId,
        isStreamer,
        steam32Id,
      })
      return null
    }

    return (matches ?? []).reduce<HeroWinLoss>(
      (record, match) => {
        if (match.won === true) record.win++
        if (match.won === false) record.lose++
        return record
      },
      { lose: 0, win: 0 },
    )
  } catch (error) {
    logger.error('[HERO] Failed to read tracked hero stats', {
      error,
      heroId,
      isStreamer,
      steam32Id,
    })
    return null
  }
}
