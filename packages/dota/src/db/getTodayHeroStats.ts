import { supabase } from '@dotabod/shared-utils'
import getHero, { type HeroNames } from '../dota/lib/getHero.js'

interface HeroStat {
  heroName: string
  wins: number
  losses: number
}

interface TodayHeroStatsParams {
  token: string
  startDate?: Date | null
}

export async function getTodayHeroStats({
  token,
  startDate,
}: TodayHeroStatsParams): Promise<HeroStat[]> {
  if (!token) {
    return []
  }

  // Default to 12 hours ago if no start date provided (same as getWL)
  const fromDate =
    startDate?.toISOString() ?? new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

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
    if (!match.hero_name) continue

    const heroData = getHero(match.hero_name as HeroNames)
    const heroName = heroData?.localized_name ?? match.hero_name

    const existing = heroStatsMap.get(heroName) ?? { wins: 0, losses: 0 }
    if (match.won) {
      existing.wins++
    } else {
      existing.losses++
    }
    heroStatsMap.set(heroName, existing)
  }

  // Convert to array and maintain order of first appearance
  const result: HeroStat[] = []
  const seenHeroes = new Set<string>()

  for (const match of matches) {
    if (!match.hero_name) continue

    const heroData = getHero(match.hero_name as HeroNames)
    const heroName = heroData?.localized_name ?? match.hero_name

    if (!seenHeroes.has(heroName)) {
      seenHeroes.add(heroName)
      const stats = heroStatsMap.get(heroName)
      if (stats) {
        result.push({
          heroName,
          wins: stats.wins,
          losses: stats.losses,
        })
      }
    }
  }

  return result
}
