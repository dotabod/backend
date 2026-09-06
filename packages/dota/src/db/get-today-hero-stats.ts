import { supabase } from '@dotabod/shared-utils'

import getHero from '../dota/lib/get-hero'
import { getTodayStartDate } from './win-loss-window'

interface HeroStat {
  heroName: string
  wins: number
  losses: number
}

interface TodayHeroStatsParams {
  token: string
}

export const getTodayHeroStats = async function getTodayHeroStats({
  token,
}: TodayHeroStatsParams): Promise<HeroStat[]> {
  if (!token) {
    return []
  }

  const fromDate = getTodayStartDate().toISOString()

  const { data: matches, error } = await supabase
    .from('matches')
    .select('hero_name, won')
    .eq('userId', token)
    .not('won', 'is', null)
    .not('hero_name', 'is', null)
    .gte('created_at', fromDate)
    .order('created_at', { ascending: true })

  if (error || !matches?.length) {
    return []
  }

  // Group by hero and count wins/losses
  const heroStatsMap = new Map<string, { wins: number; losses: number }>()

  for (const match of matches) {
    if (!match.hero_name) {
      continue
    }

    const heroData = getHero(match.hero_name)
    const heroName = heroData?.localized_name ?? match.hero_name

    const existing = heroStatsMap.get(heroName) ?? { losses: 0, wins: 0 }
    if (match.won) {
      existing.wins += 1
    } else {
      existing.losses += 1
    }
    heroStatsMap.set(heroName, existing)
  }

  // Convert to array and maintain order of first appearance
  const result: HeroStat[] = []
  const seenHeroes = new Set<string>()

  for (const match of matches) {
    if (!match.hero_name) {
      continue
    }

    const heroData = getHero(match.hero_name)
    const heroName = heroData?.localized_name ?? match.hero_name

    if (!seenHeroes.has(heroName)) {
      seenHeroes.add(heroName)
      const stats = heroStatsMap.get(heroName)
      if (stats) {
        result.push({
          heroName,
          losses: stats.losses,
          wins: stats.wins,
        })
      }
    }
  }

  return result
}
